import { prisma } from "../lib/prisma.js";
import { decryptSecret } from "../utils/node-credential-crypto.js";
import type {
  AgentCreateServerRequest,
  AgentResourceLimits,
  AgentAllocationConfig,
  AgentServerRecord,
} from "../types/agent-contract.js";

// The single low-level client for every Panel -> Agent REST call defined
// in docs/CLOUDN_AGENT_INTEGRATION.md §7-§12. Nothing else in the codebase
// should construct an Agent URL or Authorization header by hand — that
// keeps the auth scheme (§2.1) and error envelope parsing (§3, §14) in
// exactly one place.
//
// This client makes REAL network calls. Until a real Agent is deployed at
// a node's configured hostname/port, every call here will fail with a
// connection error — which is the correct, honest behavior. Nothing in
// this file pretends a request succeeded.

export class AgentApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface AgentEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

async function getBearerToken(nodeId: string): Promise<string> {
  const credential = await prisma.nodeCredential.findUnique({ where: { nodeId } });
  if (!credential) {
    throw new AgentApiError(401, "INVALID_NODE_CREDENTIALS", "This node has no stored credentials");
  }
  const secret = decryptSecret(credential.secretCiphertext);
  return `${nodeId}.${secret}`;
}

interface NodeConn {
  id: string;
  protocol: string;
  hostname: string;
  fqdn: string | null;
  port: number;
}

function baseUrl(node: NodeConn): string {
  const scheme = node.protocol === "HTTPS" ? "https" : "http";
  const host = node.fqdn || node.hostname;
  return `${scheme}://${host}:${node.port}`;
}

async function agentFetch<T>(
  node: NodeConn,
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  const token = await getBearerToken(node.id);
  const url = new URL(`${baseUrl(node)}/api/v1/agent${path}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    // The Agent is unreachable (not deployed, network issue, etc). Surface
    // this plainly rather than swallowing it into a fake success.
    throw new AgentApiError(
      503,
      "DOCKER_UNAVAILABLE",
      `Could not reach Agent at ${baseUrl(node)}: ${(err as Error).message}`
    );
  }

  const json = (await res.json().catch(() => null)) as AgentEnvelope<T> | null;
  if (!json || !json.success) {
    const code = json?.error?.code ?? "INTERNAL_ERROR";
    const message = json?.error?.message ?? `Agent request failed (${res.status})`;
    throw new AgentApiError(res.status, code, message);
  }
  return json.data as T;
}

export const agentClient = {
  // §7 Server lifecycle
  listServers: (node: NodeConn) => agentFetch<AgentServerRecord[]>(node, "/servers"),
  createServer: (node: NodeConn, body: AgentCreateServerRequest) =>
    agentFetch<AgentServerRecord>(node, "/servers", { method: "POST", body }),
  getServer: (node: NodeConn, serverId: string) => agentFetch<AgentServerRecord>(node, `/servers/${serverId}`),
  startServer: (node: NodeConn, serverId: string) =>
    agentFetch<null>(node, `/servers/${serverId}/start`, { method: "POST" }),
  stopServer: (node: NodeConn, serverId: string) =>
    agentFetch<null>(node, `/servers/${serverId}/stop`, { method: "POST" }),
  restartServer: (node: NodeConn, serverId: string) =>
    agentFetch<null>(node, `/servers/${serverId}/restart`, { method: "POST" }),
  killServer: (node: NodeConn, serverId: string) =>
    agentFetch<null>(node, `/servers/${serverId}/kill`, { method: "POST" }),
  suspendServer: (node: NodeConn, serverId: string) =>
    agentFetch<null>(node, `/servers/${serverId}/suspend`, { method: "POST" }),
  unsuspendServer: (node: NodeConn, serverId: string) =>
    agentFetch<null>(node, `/servers/${serverId}/unsuspend`, { method: "POST" }),
  deleteServer: (node: NodeConn, serverId: string) =>
    agentFetch<null>(node, `/servers/${serverId}`, { method: "DELETE" }),
  updateResources: (node: NodeConn, serverId: string, resources: AgentResourceLimits) =>
    agentFetch<AgentServerRecord>(node, `/servers/${serverId}/resources`, { method: "PATCH", body: resources }),
  updateAllocation: (node: NodeConn, serverId: string, allocation: AgentAllocationConfig) =>
    agentFetch<AgentServerRecord>(node, `/servers/${serverId}/allocation`, { method: "PATCH", body: allocation }),
  issueConsoleToken: (node: NodeConn, serverId: string) =>
    agentFetch<{ token: string; expiresInSeconds: number }>(node, `/servers/${serverId}/console/token`, {
      method: "POST",
    }),

  // §8 Console & logs
  getLogs: (node: NodeConn, serverId: string, tail = 200) =>
    agentFetch<{ logs: string }>(node, `/servers/${serverId}/logs`, { query: { tail } }),
  getStats: (node: NodeConn, serverId: string) =>
    agentFetch<Record<string, unknown>>(node, `/servers/${serverId}/stats`),

  // §9 File management
  listFiles: (node: NodeConn, serverId: string, path: string) =>
    agentFetch<
      Array<{ name: string; path: string; isDirectory: boolean; size: number; modifiedAt: string; mode: string }>
    >(node, `/servers/${serverId}/files/list`, { query: { path } }),
  readFile: (node: NodeConn, serverId: string, path: string) =>
    agentFetch<{ content: string }>(node, `/servers/${serverId}/files/contents`, { query: { path } }),
  writeFile: (node: NodeConn, serverId: string, path: string, content: string) =>
    agentFetch<null>(node, `/servers/${serverId}/files/contents`, { method: "PUT", query: { path }, body: { content } }),
  createDirectory: (node: NodeConn, serverId: string, path: string) =>
    agentFetch<null>(node, `/servers/${serverId}/files/directory`, { method: "POST", body: { path } }),
  renameFile: (node: NodeConn, serverId: string, from: string, to: string) =>
    agentFetch<null>(node, `/servers/${serverId}/files/rename`, { method: "POST", body: { from, to } }),
  copyFile: (node: NodeConn, serverId: string, from: string, to: string) =>
    agentFetch<null>(node, `/servers/${serverId}/files/copy`, { method: "POST", body: { from, to } }),
  deleteFile: (node: NodeConn, serverId: string, path: string) =>
    agentFetch<null>(node, `/servers/${serverId}/files`, { method: "DELETE", body: { path } }),

  // §12 Backups
  listBackups: (node: NodeConn, serverId: string) =>
    agentFetch<Array<{ id: string; serverId: string; fileName: string; sizeBytes: number; createdAt: string }>>(
      node,
      `/servers/${serverId}/backups`
    ),
  createBackup: (node: NodeConn, serverId: string) =>
    agentFetch<{ id: string; serverId: string; fileName: string; sizeBytes: number; createdAt: string }>(
      node,
      `/servers/${serverId}/backups`,
      { method: "POST" }
    ),
  restoreBackup: (node: NodeConn, serverId: string, backupId: string) =>
    agentFetch<null>(node, `/servers/${serverId}/backups/${backupId}/restore`, { method: "POST" }),
  deleteBackup: (node: NodeConn, serverId: string, backupId: string) =>
    agentFetch<null>(node, `/servers/${serverId}/backups/${backupId}`, { method: "DELETE" }),

  // §11 Status (authenticated diagnostic snapshot)
  getStatus: (node: NodeConn) => agentFetch<Record<string, unknown>>(node, "/status"),
};
