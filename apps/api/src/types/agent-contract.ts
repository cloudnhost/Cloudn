// Types mirroring the authoritative contracts in /docs/CLOUDN_AGENT_INTEGRATION.md
// and /docs/CLOUDN_EGG_SPEC.md. Keeping these as a single typed source lets the
// Panel's receiving endpoints (node registration/heartbeat/events) and its
// future outbound Agent client (CloudNAgentProvider) share one definition of
// the wire format, so a schema drift between the two shows up as a compile
// error instead of a runtime surprise once the real Agent exists.
//
// IMPORTANT: these are the Agent's wire formats, not the Panel's internal
// Prisma models. Translating between them is the job of the resolver
// services (see services/egg-resolver.service.ts), never ad-hoc inline
// mapping in a route handler.

// ── Egg wire format (CLOUDN_EGG_SPEC.md §1-§2) ────────────────────────────

export interface AgentEggEnvironmentEntry {
  default?: string;
  required?: boolean;
}

export interface AgentEggInstallScript {
  image: string;
  entrypoint?: string;
  script: string;
}

export interface AgentEggConfigFileFind {
  [configKey: string]: string; // value template, may contain {{VAR}}
}

export type AgentEggConfigParser = "properties" | "yaml" | "json" | "ini" | "xml" | "env";

export interface AgentEggConfigFile {
  path: string;
  parser: AgentEggConfigParser;
  find: AgentEggConfigFileFind;
}

export interface AgentEggDefinition {
  id: string;
  name: string;
  version: string;
  dockerImage: string;
  startupCommand: string;
  stopCommand?: string;
  environment: Record<string, AgentEggEnvironmentEntry>;
  installScript?: AgentEggInstallScript;
  configFiles?: AgentEggConfigFile[];
}

// ── Server lifecycle wire format (CLOUDN_AGENT_INTEGRATION.md §7) ─────────

export type AgentServerStatus =
  | "installing"
  | "install_failed"
  | "offline"
  | "starting"
  | "running"
  | "stopping"
  | "crashed"
  | "suspended"
  | "deleting";

export interface AgentResourceLimits {
  cpuPercent: number;
  memoryMb: number;
  swapMb: number;
  diskMb: number;
  ioWeight: number;
}

export interface AgentAllocationConfig {
  ip: string;
  port: number;
  additionalPorts?: number[];
}

export interface AgentCreateServerRequest {
  serverId: string;
  panelServerId: string;
  egg: AgentEggDefinition;
  environment: Record<string, string>;
  resources: AgentResourceLimits;
  allocation: AgentAllocationConfig;
}

export interface AgentServerRecord {
  id: string;
  panelServerId: string;
  status: AgentServerStatus;
  containerId: string | null;
  egg: AgentEggDefinition;
  environment: Record<string, string>;
  resources: AgentResourceLimits;
  allocation: AgentAllocationConfig;
  createdAt: string;
  updatedAt: string;
  suspended: boolean;
}

// ── Node registration & heartbeat (received by the Panel) ────────────────
// (CLOUDN_AGENT_INTEGRATION.md §4-§5) — the Panel is the *receiver* of
// these two calls, which is why they're implemented as real endpoints
// (see routes/agent.routes.ts) even though the Agent that would call them
// doesn't exist yet.

export interface AgentRegisterRequest {
  nodeId: string;
  nodeUuid: string;
  publicUrl: string;
}

export interface AgentHeartbeatRequest {
  nodeId: string;
  agentVersion: string;
  timestamp: string;
  cpuUsagePercent: number;
  memoryUsageMb: number;
  memoryTotalMb: number;
  diskUsageMb: number;
  diskTotalMb: number;
  dockerStatus: "ok" | "unavailable";
  agentStatus: "ok" | "degraded";
  runningServers: number;
  totalServers: number;
}

// The Panel should mark a node OFFLINE if no heartbeat arrives within this
// window (CLOUDN_AGENT_INTEGRATION.md §5: "3 × HEARTBEAT_INTERVAL_MS",
// default heartbeat interval 15000ms).
export const HEARTBEAT_STALE_THRESHOLD_MS = 45_000;

// ── Events (CLOUDN_AGENT_INTEGRATION.md §6) ───────────────────────────────

export type AgentEventType =
  | "server.install.started"
  | "server.install.output"
  | "server.install.completed"
  | "server.install.failed"
  | "server.status.changed"
  | "server.resources.updated"
  | "server.allocation.updated"
  | "server.deleted"
  | "server.crashed"
  | "agent.error";

export interface AgentEvent<T = unknown> {
  type: AgentEventType | string; // Panel must accept unknown types (forward-compat)
  data: T;
  timestamp: string;
}

// ── Error codes (CLOUDN_AGENT_INTEGRATION.md §14) ─────────────────────────
// Only the codes the Panel itself may need to emit as a *receiver* of Agent
// calls, or reference when the future outbound client surfaces an Agent
// error to the admin UI.

export type AgentErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_NODE_CREDENTIALS"
  | "TOKEN_EXPIRED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "INVALID_PATH"
  | "SERVER_NOT_FOUND"
  | "SERVER_ALREADY_EXISTS"
  | "SERVER_ALREADY_RUNNING"
  | "SERVER_NOT_RUNNING"
  | "SERVER_SUSPENDED"
  | "SERVER_INSTALL_IN_PROGRESS"
  | "DOCKER_UNAVAILABLE"
  | "DOCKER_OPERATION_FAILED"
  | "CONTAINER_NOT_FOUND"
  | "FILE_NOT_FOUND"
  | "FILE_TOO_LARGE"
  | "DISK_LIMIT_EXCEEDED"
  | "FILE_OPERATION_FAILED"
  | "EGG_INVALID"
  | "EGG_INSTALL_FAILED"
  | "ALLOCATION_INVALID"
  | "BACKUP_NOT_FOUND"
  | "BACKUP_FAILED"
  | "INTERNAL_ERROR"
  | "NOT_IMPLEMENTED"
  | "RATE_LIMITED";
