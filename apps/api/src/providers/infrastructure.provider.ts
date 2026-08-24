// The contract every infrastructure backend must satisfy. The rest of the
// application (controllers, services) only ever talks to this interface —
// never to MockProvider or CloudNAgentProvider directly. Swapping providers
// is an env var change (INFRASTRUCTURE_PROVIDER), not a code change.
//
//   Panel = control plane (owns business rules: who can do what)
//   Agent = execution plane (just carries out instructions)

export interface ConsoleLine {
  timestamp: string;
  line: string;
}

export interface ResourceSnapshot {
  cpuPercent: number;
  ramMb: number;
  diskMb: number;
  networkRxBytes: number;
  networkTxBytes: number;
  uptimeSeconds: number;
}

export interface NodeStatusSnapshot {
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  lastHeartbeat: Date | null;
  agentVersion: string | null;
}

export interface ProvisionServerInput {
  serverId: string;
  dockerImage: string;
  startupCommand: string;
  installScript?: string | null;
  env: Record<string, string>;
  cpuLimit: number;
  ramLimitMb: number;
  diskLimitMb: number;
  primaryPort: number;
  primaryIp: string;
}

export interface UpdateResourcesInput {
  cpuLimit: number;
  ramLimitMb: number;
  diskLimitMb: number;
  swapMb: number;
}

export interface UpdateAllocationInput {
  ip: string;
  port: number;
  additionalPorts?: number[];
}

export interface ConsoleTokenResult {
  token: string;
  wsUrl: string;
  expiresInSeconds: number;
}

export interface InfrastructureProvider {
  readonly name: string;

  getNodeStatus(nodeId: string): Promise<NodeStatusSnapshot>;

  createServer(input: ProvisionServerInput): Promise<void>;
  deleteServer(serverId: string): Promise<void>;
  startServer(serverId: string): Promise<void>;
  stopServer(serverId: string): Promise<void>;
  restartServer(serverId: string): Promise<void>;

  sendCommand(serverId: string, command: string): Promise<void>;
  getConsole(serverId: string, sinceLine?: number): Promise<ConsoleLine[]>;
  getResources(serverId: string): Promise<ResourceSnapshot>;

  // Per CLOUDN_AGENT_INTEGRATION.md §7: resource/allocation changes are
  // pushed to the Agent explicitly rather than inferred from a server
  // update — the Panel decides the new limits, the Agent just applies
  // them. Allocation changes require a restart on the Agent side; the
  // Panel doesn't need to know that here, just that it happened.
  updateResources(serverId: string, resources: UpdateResourcesInput): Promise<void>;
  updateAllocation(serverId: string, allocation: UpdateAllocationInput): Promise<void>;

  // Per §2.2/§7: browsers connect to the Agent's console WebSocket
  // directly using a short-lived token, bypassing the Panel for the
  // stream itself. Returns null for providers with no separate WS console
  // (the Mock Provider's console stays REST-polled).
  getConsoleToken(serverId: string): Promise<ConsoleTokenResult | null>;
}
