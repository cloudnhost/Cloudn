import { prisma } from "../lib/prisma.js";
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

// Deterministic-ish in-memory simulation of what a real CloudN Agent will
// eventually do. This is the ONLY place demo/fake behavior lives — nothing
// outside this file should know or care that infrastructure isn't real.
// Deleting this file (and the `mock` case in the provider factory) is the
// entire migration path to a real Agent.

interface MockServerState {
  status: "CREATING" | "INSTALLING" | "STARTING" | "ONLINE" | "OFFLINE" | "STOPPING";
  startedAt: number;
  console: ConsoleLine[];
  cpu: number;
  ram: number;
  disk: number;
  diskLimitMb: number;
  ramLimitMb: number;
  cpuLimit: number;
}

const state = new Map<string, MockServerState>();

function pushLine(serverId: string, line: string) {
  const s = state.get(serverId);
  if (!s) return;
  s.console.push({ timestamp: new Date().toISOString(), line });
  if (s.console.length > 500) s.console.shift();
}

function jitter(base: number, range: number, max: number) {
  const v = base + (Math.random() - 0.5) * range;
  return Math.max(0, Math.min(max, Math.round(v * 10) / 10));
}

export class MockProvider implements InfrastructureProvider {
  readonly name = "mock";

  async getNodeStatus(nodeId: string): Promise<NodeStatusSnapshot> {
    // Demo nodes report a believable, gently fluctuating load so the
    // dashboard doesn't look static or obviously fake.
    return {
      status: "ONLINE",
      cpuUsage: jitter(35, 20, 100),
      memoryUsage: jitter(45, 15, 100),
      diskUsage: jitter(20, 8, 100),
      lastHeartbeat: new Date(),
      agentVersion: "mock-0.0.0",
    };
  }

  async createServer(input: ProvisionServerInput): Promise<void> {
    state.set(input.serverId, {
      status: "CREATING",
      startedAt: Date.now(),
      console: [],
      cpu: 0,
      ram: 0,
      disk: Math.round(input.diskLimitMb * 0.05),
      diskLimitMb: input.diskLimitMb,
      ramLimitMb: input.ramLimitMb,
      cpuLimit: input.cpuLimit,
    });
    pushLine(input.serverId, "Allocating resources...");

    // Simulate realistic provisioning timing instead of instantly flipping
    // to ONLINE, per spec — this keeps the UI honest about what "creating a
    // server" should feel like once a real Agent is involved.
    const s = state.get(input.serverId)!;
    setTimeout(() => {
      s.status = "INSTALLING";
      pushLine(input.serverId, `Pulling image ${input.dockerImage}...`);
      pushLine(input.serverId, "Running installation script...");
    }, 1500);

    setTimeout(() => {
      s.status = "STARTING";
      pushLine(input.serverId, "Installation complete.");
      pushLine(input.serverId, `Starting: ${input.startupCommand}`);
    }, 4000);

    setTimeout(async () => {
      s.status = "ONLINE";
      pushLine(input.serverId, "Server started.");
      pushLine(input.serverId, `Listening on ${input.primaryIp}:${input.primaryPort}`);
      await prisma.server
        .update({ where: { id: input.serverId }, data: { status: "ONLINE" } })
        .catch(() => {});
    }, 6000);
  }

  async deleteServer(serverId: string): Promise<void> {
    state.delete(serverId);
  }

  async startServer(serverId: string): Promise<void> {
    const s = state.get(serverId);
    if (!s) return;
    s.status = "STARTING";
    pushLine(serverId, "Starting server...");
    setTimeout(() => {
      s.status = "ONLINE";
      pushLine(serverId, "Server started.");
    }, 2000);
  }

  async stopServer(serverId: string): Promise<void> {
    const s = state.get(serverId);
    if (!s) return;
    s.status = "STOPPING";
    pushLine(serverId, "Stopping server...");
    setTimeout(() => {
      s.status = "OFFLINE";
      s.cpu = 0;
      s.ram = 0;
      pushLine(serverId, "Server stopped.");
    }, 1500);
  }

  async restartServer(serverId: string): Promise<void> {
    await this.stopServer(serverId);
    setTimeout(() => this.startServer(serverId), 1600);
  }

  async sendCommand(serverId: string, command: string): Promise<void> {
    pushLine(serverId, `> ${command}`);
    pushLine(serverId, `Unknown command or no handler for "${command}" (mock provider).`);
  }

  async getConsole(serverId: string, sinceLine = 0): Promise<ConsoleLine[]> {
    const s = state.get(serverId);
    if (!s) return [];
    return s.console.slice(sinceLine);
  }

  async getResources(serverId: string): Promise<ResourceSnapshot> {
    const s = state.get(serverId);
    if (!s) {
      return {
        cpuPercent: 0,
        ramMb: 0,
        diskMb: 0,
        networkRxBytes: 0,
        networkTxBytes: 0,
        uptimeSeconds: 0,
      };
    }
    if (s.status === "ONLINE") {
      s.cpu = jitter(Math.min(s.cpuLimit, 60), 20, s.cpuLimit);
      s.ram = jitter(s.ramLimitMb * 0.5, s.ramLimitMb * 0.2, s.ramLimitMb);
    }
    return {
      cpuPercent: s.cpu,
      ramMb: s.ram,
      diskMb: s.disk,
      networkRxBytes: Math.round(jitter(50000, 40000, 500000)),
      networkTxBytes: Math.round(jitter(20000, 15000, 200000)),
      uptimeSeconds:
        s.status === "ONLINE" ? Math.floor((Date.now() - s.startedAt) / 1000) : 0,
    };
  }

  async updateResources(serverId: string, resources: UpdateResourcesInput): Promise<void> {
    const s = state.get(serverId);
    if (!s) return;
    s.cpuLimit = resources.cpuLimit;
    s.ramLimitMb = resources.ramLimitMb;
    s.diskLimitMb = resources.diskLimitMb;
    pushLine(serverId, `Resources updated: ${resources.cpuLimit}% CPU, ${resources.ramLimitMb}MB RAM, ${resources.diskLimitMb}MB disk.`);
  }

  async updateAllocation(serverId: string, allocation: UpdateAllocationInput): Promise<void> {
    pushLine(serverId, `Allocation updated: primary now ${allocation.ip}:${allocation.port}. Restarting to apply...`);
  }

  async getConsoleToken(_serverId: string): Promise<ConsoleTokenResult | null> {
    // The mock console stays REST-polled (see servers.routes.ts's
    // /console endpoint) — there's no separate WebSocket to hand a token
    // for, so this intentionally returns null rather than a fake one.
    return null;
  }
}
