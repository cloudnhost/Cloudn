import { Router } from "express";
import { z } from "zod";
import argon2 from "argon2";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../utils/response.js";
import { requireNodeAuth } from "../middleware/node-auth.middleware.js";
import { logActivity } from "../services/audit.service.js";

// Panel-side implementation of the receiving half of
// docs/CLOUDN_AGENT_INTEGRATION.md §4-§6. The Agent itself is not being
// built yet, but these endpoints are real and independently testable —
// nothing here is mocked. Once a real Agent exists and is pointed at a
// node's CLOUDN_PANEL_URL, it can register and heartbeat against this
// router with zero Panel-side changes.
export const agentRouter = Router();

// §4 Node Registration — called by the Agent on startup and every
// reconnect. Marks isDemo=false, since a real Agent has now spoken up for
// this node (demo/mock nodes never call this).
const registerSchema = z.object({
  nodeId: z.string().min(1),
  nodeUuid: z.string().min(1),
  publicUrl: z.string().url(),
});

agentRouter.post("/nodes/register", requireNodeAuth, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 422, "VALIDATION_ERROR", parsed.error.issues[0].message);
  }
  const node = req.agentNode!;

  if (parsed.data.nodeUuid !== node.uuid) {
    return fail(res, 401, "INVALID_NODE_CREDENTIALS", "nodeUuid does not match this node");
  }

  await prisma.node.update({
    where: { id: node.id },
    data: { isDemo: false, status: "ONLINE", lastHeartbeat: new Date() },
  });

  await logActivity({
    type: "NODE_AGENT_REGISTERED",
    message: `Agent registered for node "${node.name}" at ${parsed.data.publicUrl}`,
  });

  return ok(res, { acknowledged: true });
});

// §5 Heartbeat — the Panel's online/offline determination for real nodes
// is heartbeat-freshness based (see HEARTBEAT_STALE_THRESHOLD_MS and its
// use in nodes.routes.ts), not this endpoint deciding status directly;
// this endpoint's job is just to record the sample.
const heartbeatSchema = z.object({
  nodeId: z.string().min(1),
  agentVersion: z.string().min(1),
  timestamp: z.string().min(1),
  cpuUsagePercent: z.number().min(0).max(100),
  memoryUsageMb: z.number().min(0),
  memoryTotalMb: z.number().min(0),
  diskUsageMb: z.number().min(0),
  diskTotalMb: z.number().min(0),
  dockerStatus: z.enum(["ok", "unavailable"]),
  agentStatus: z.enum(["ok", "degraded"]),
  runningServers: z.number().min(0),
  totalServers: z.number().min(0),
});

agentRouter.post("/heartbeat", requireNodeAuth, async (req, res) => {
  const parsed = heartbeatSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 422, "VALIDATION_ERROR", parsed.error.issues[0].message);
  }
  const node = req.agentNode!;
  const d = parsed.data;

  await prisma.node.update({
    where: { id: node.id },
    data: {
      status: "ONLINE",
      lastHeartbeat: new Date(),
      agentVersion: d.agentVersion,
      cpuUsage: d.cpuUsagePercent,
      memoryUsage: d.memoryTotalMb > 0 ? (d.memoryUsageMb / d.memoryTotalMb) * 100 : 0,
      diskUsage: d.diskTotalMb > 0 ? (d.diskUsageMb / d.diskTotalMb) * 100 : 0,
    },
  });

  return ok(res, { acknowledged: true });
});

// §6 Events — generic stream. Known types update Panel state; unknown
// types are accepted (never rejected) per the spec's forward-compat rule,
// and always audited so nothing silently disappears.
const eventSchema = z.object({
  type: z.string().min(1),
  data: z.record(z.any()).default({}),
  timestamp: z.string().min(1),
});

agentRouter.post("/events", requireNodeAuth, async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 422, "VALIDATION_ERROR", parsed.error.issues[0].message);
  }
  const event = parsed.data;
  const node = req.agentNode!;

  try {
    switch (event.type) {
      case "server.status.changed": {
        const { serverId, status } = event.data as { serverId?: string; status?: string };
        if (serverId && status) {
          await prisma.server
            .update({ where: { id: serverId }, data: { status: mapAgentStatus(status) } })
            .catch(() => {});
        }
        break;
      }
      case "server.crashed": {
        const { serverId } = event.data as { serverId?: string };
        if (serverId) {
          await prisma.server.update({ where: { id: serverId }, data: { status: "ERRORED" } }).catch(() => {});
        }
        break;
      }
      case "server.deleted": {
        // The Agent is the source of truth for whether the container/dir
        // is actually gone, but the Panel already removes its own Server
        // row synchronously on DELETE /servers/:id — this event is a
        // reconciliation signal, not the primary deletion path, so it's
        // intentionally a no-op beyond logging today.
        break;
      }
      default:
        // Unknown event types are accepted, not rejected — forward
        // compatibility per CLOUDN_AGENT_INTEGRATION.md §6.
        break;
    }

    await logActivity({
      type: `AGENT_EVENT_${event.type.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
      message: `Event "${event.type}" from node "${node.name}"`,
      metadata: event.data,
    });
  } catch {
    // Never fail the Agent's call because of a Panel-side processing
    // error — the spec says the Agent drops events it can't deliver
    // rather than queuing; the Panel should be equally tolerant on
    // receipt so a bad event doesn't jam the stream.
  }

  return ok(res, { acknowledged: true });
});

// Per CLOUDN_AGENT_INTEGRATION.md §10: the Agent runs the real SFTP
// server but doesn't generate/store the authoritative password — the
// Panel provisions it (see POST /servers/:id/sftp/rotate-credentials) and
// the Agent validates a login attempt "directly or via a callback to the
// Panel". This is that callback: the Agent posts the username/password it
// received on the wire, the Panel checks it against the argon2 hash it
// already stores, and returns a plain valid/invalid verdict — the
// plaintext password is never persisted or logged anywhere.
const sftpAuthSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

agentRouter.post("/sftp/authenticate", requireNodeAuth, async (req, res) => {
  const parsed = sftpAuthSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 422, "VALIDATION_ERROR", "username and password are required");
  }

  const server = await prisma.server.findUnique({ where: { sftpUsername: parsed.data.username } });
  if (!server || !server.sftpPasswordHash) {
    return ok(res, { valid: false });
  }

  const valid = await argon2.verify(server.sftpPasswordHash, parsed.data.password).catch(() => false);
  if (!valid) return ok(res, { valid: false });

  return ok(res, { valid: true, serverId: server.id });
});

function mapAgentStatus(
  agentStatus: string
): "CREATING" | "INSTALLING" | "STARTING" | "ONLINE" | "STOPPING" | "OFFLINE" | "ERRORED" | "SUSPENDED" {
  switch (agentStatus) {
    case "installing":
      return "INSTALLING";
    case "install_failed":
      return "ERRORED";
    case "offline":
      return "OFFLINE";
    case "starting":
      return "STARTING";
    case "running":
      return "ONLINE";
    case "stopping":
      return "STOPPING";
    case "crashed":
      return "ERRORED";
    case "suspended":
      return "SUSPENDED";
    case "deleting":
      return "STOPPING";
    default:
      return "OFFLINE";
  }
}
