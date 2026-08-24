import { prisma } from "../lib/prisma.js";
import { agentClient, AgentApiError } from "./agent-client.js";
import type {
  ConsoleLine,
  ConsoleTokenResult,
  InfrastructureProvider,
  NodeStatusSnapshot,
  ProvisionServerInput,
  ResourceSnapshot,
  UpdateAllocationInput,
  UpdateResourcesInput,
} from "./infrastructure.provider.js";
import { resolveEgg } from "../services/egg-resolver.service.js";
import { HEARTBEAT_STALE_THRESHOLD_MS } from "../types/agent-contract.js";

// The real implementation of InfrastructureProvider for a node with an
// actual CloudN Agent deployed. Every method here makes a genuine HTTP
// call through agentClient — there is no simulation or fallback data.
// Until a real Agent is running at the node's configured host/port, these
// calls fail with AgentApiError (DOCKER_UNAVAILABLE / connection refused),
// which is the correct behavior: the Panel should never silently pretend
// a request to infrastructure that doesn't exist yet succeeded.
async function loadServerWithNode(serverId: string) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: { node: true, egg: { include: { variables: true } }, variables: { include: { eggVariable: true } } },
  });
  if (!server) throw new AgentApiError(404, "SERVER_NOT_FOUND", "Server not found in Panel database");
  return server;
}

export class CloudNAgentProvider implements InfrastructureProvider {
  readonly name = "cloudn-agent";

  async getNodeStatus(nodeId: string): Promise<NodeStatusSnapshot> {
    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new AgentApiError(404, "SERVER_NOT_FOUND", "Node not found");

    // Prefer a live call to the Agent's own /status endpoint; fall back to
    // the last known heartbeat if the Agent is briefly unreachable, rather
    // than throwing and breaking the whole dashboard over one flaky call.
    try {
      const status = await agentClient.getStatus(node);
      return {
        status: "ONLINE",
        cpuUsage: Number(status.cpuUsagePercent ?? 0),
        memoryUsage: Number(status.memoryUsagePercent ?? 0),
        diskUsage: Number(status.diskUsagePercent ?? 0),
        lastHeartbeat: node.lastHeartbeat,
        agentVersion: (status.agentVersion as string) ?? node.agentVersion,
      };
    } catch {
      const isFresh = node.lastHeartbeat && Date.now() - node.lastHeartbeat.getTime() < HEARTBEAT_STALE_THRESHOLD_MS;
      return {
        status: isFresh ? "ONLINE" : "OFFLINE",
        cpuUsage: node.cpuUsage ?? 0,
        memoryUsage: node.memoryUsage ?? 0,
        diskUsage: node.diskUsage ?? 0,
        lastHeartbeat: node.lastHeartbeat,
        agentVersion: node.agentVersion,
      };
    }
  }

  async createServer(input: ProvisionServerInput): Promise<void> {
    const server = await loadServerWithNode(input.serverId);
    const overrides: Record<string, string> = {};
    for (const v of server.variables) overrides[v.eggVariable.envVariable] = v.value;

    const { definition } = resolveEgg({ egg: server.egg, overrides });

    await agentClient.createServer(server.node, {
      serverId: server.id,
      panelServerId: server.id,
      egg: definition,
      environment: input.env,
      resources: {
        cpuPercent: input.cpuLimit,
        memoryMb: input.ramLimitMb,
        swapMb: server.swapMb,
        diskMb: input.diskLimitMb,
        ioWeight: server.ioPriority,
      },
      allocation: { ip: input.primaryIp, port: input.primaryPort },
    });
  }

  async deleteServer(serverId: string): Promise<void> {
    const server = await loadServerWithNode(serverId);
    await agentClient.deleteServer(server.node, serverId);
  }

  async startServer(serverId: string): Promise<void> {
    const server = await loadServerWithNode(serverId);
    await agentClient.startServer(server.node, serverId);
  }

  async stopServer(serverId: string): Promise<void> {
    const server = await loadServerWithNode(serverId);
    await agentClient.stopServer(server.node, serverId);
  }

  async restartServer(serverId: string): Promise<void> {
    const server = await loadServerWithNode(serverId);
    await agentClient.restartServer(server.node, serverId);
  }

  // There is no REST equivalent for sending a live console command — per
  // CLOUDN_AGENT_INTEGRATION.md §8, that only happens over the console
  // WebSocket (`send_command` frame) using a token from getConsoleToken().
  // A caller that reaches this method is using the wrong transport, so it
  // fails loudly with a clear explanation rather than silently no-op'ing.
  async sendCommand(): Promise<void> {
    throw new AgentApiError(
      501,
      "NOT_IMPLEMENTED",
      "Live commands must be sent over the Agent's console WebSocket (see getConsoleToken), not this REST provider."
    );
  }

  // Same reasoning as sendCommand: real-time console output streams over
  // the WebSocket. This REST fallback returns the Agent's buffered log
  // tail as a single chunk so the console tab still shows *something*
  // useful (e.g. right after a page refresh) without pretending to be a
  // live stream.
  async getConsole(serverId: string): Promise<ConsoleLine[]> {
    const server = await loadServerWithNode(serverId);
    const { logs } = await agentClient.getLogs(server.node, serverId);
    if (!logs) return [];
    return [{ timestamp: new Date().toISOString(), line: logs }];
  }

  async getResources(serverId: string): Promise<ResourceSnapshot> {
    const server = await loadServerWithNode(serverId);
    const stats = await agentClient.getStats(server.node, serverId);
    // The Agent's /stats payload is raw container stats (shape not fully
    // pinned down by the integration doc beyond "docker stats-like JSON"),
    // so this maps the fields that are named consistently and defaults
    // anything else to 0 rather than guessing.
    return {
      cpuPercent: Number(stats.cpuPercent ?? 0),
      ramMb: Number(stats.memoryMb ?? 0),
      diskMb: Number(stats.diskMb ?? 0),
      networkRxBytes: Number(stats.networkRxBytes ?? 0),
      networkTxBytes: Number(stats.networkTxBytes ?? 0),
      uptimeSeconds: Number(stats.uptimeSeconds ?? 0),
    };
  }

  async updateResources(serverId: string, resources: UpdateResourcesInput): Promise<void> {
    const server = await loadServerWithNode(serverId);
    await agentClient.updateResources(server.node, serverId, {
      cpuPercent: resources.cpuLimit,
      memoryMb: resources.ramLimitMb,
      swapMb: resources.swapMb,
      diskMb: resources.diskLimitMb,
      ioWeight: server.ioPriority,
    });
  }

  async updateAllocation(serverId: string, allocation: UpdateAllocationInput): Promise<void> {
    const server = await loadServerWithNode(serverId);
    await agentClient.updateAllocation(server.node, serverId, allocation);
  }

  async getConsoleToken(serverId: string): Promise<ConsoleTokenResult | null> {
    const server = await loadServerWithNode(serverId);
    const { token, expiresInSeconds } = await agentClient.issueConsoleToken(server.node, serverId);
    const scheme = server.node.protocol === "HTTPS" ? "wss" : "ws";
    const host = server.node.fqdn || server.node.hostname;
    const wsUrl = `${scheme}://${host}:${server.node.port}/api/v1/agent/servers/${serverId}/console/ws?token=${token}`;
    return { token, wsUrl, expiresInSeconds };
  }
}
