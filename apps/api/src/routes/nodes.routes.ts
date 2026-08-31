import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { ok, fail, ErrorCodes } from "../utils/response.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { logAudit } from "../services/audit.service.js";
import { infrastructureProvider } from "../providers/index.js";
import { HEARTBEAT_STALE_THRESHOLD_MS } from "../types/agent-contract.js";
import { encryptSecret } from "../utils/node-credential-crypto.js";

export const nodesRouter = Router();
nodesRouter.use(requireAuth);

// Self-service, deliberately minimal: any authenticated user needs to be
// able to pick a node when creating their own server, but the full node
// list (GET "/") exposes admin-only details (IPs, resource totals, live
// usage) and is staff-only. This returns just enough to choose from —
// filtered to nodes that are actually usable (enabled, not in
// maintenance) and, if the caller's plan restricts nodes, to their
// plan's allow-list. Registered before "/:id" for the same routing-order
// reason as servers.routes.ts's "/remaining-resources".
nodesRouter.get("/available", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { plan: true } });

  const nodes = await prisma.node.findMany({
    where: { isEnabled: true, status: { not: "MAINTENANCE" } },
    include: { location: true },
    orderBy: { name: "asc" },
  });

  let allowed = nodes;
  if (user?.plan?.nodeAccessMode === "ALLOW_LIST") {
    const planNodes = await prisma.planNode.findMany({ where: { planId: user.plan.id } });
    const allowedIds = new Set(planNodes.map((pn) => pn.nodeId));
    allowed = nodes.filter((n) => allowedIds.has(n.id));
  }

  return ok(
    res,
    allowed.map((n) => ({ id: n.id, name: n.name, location: n.location.name }))
  );
});

nodesRouter.get("/", requireRole("STAFF"), async (_req, res) => {
  const nodes = await prisma.node.findMany({
    include: { location: true, _count: { select: { servers: true, allocations: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Refresh live status from the active infrastructure provider (mock or
  // real Agent) rather than trusting a possibly-stale DB row.
  const withStatus = await Promise.all(
    nodes.map(async (n) => {
      // Disabled/maintenance are panel-level overrides and take priority
      // over whatever the provider reports.
      if (!n.isEnabled) {
        return {
          id: n.id, uuid: n.uuid, name: n.name, location: n.location.name, locationId: n.locationId, hostname: n.hostname,
          fqdn: n.fqdn, ipAddress: n.ipAddress, port: n.port, protocol: n.protocol,
          memoryMb: n.memoryMb, diskMb: n.diskMb, cpuCores: n.cpuCores,
          serverCount: n._count.servers, allocationCount: n._count.allocations, usesMockProvider: n.usesMockProvider,
          isEnabled: false, maintenanceReason: n.maintenanceReason,
          status: "OFFLINE", cpuUsage: 0, memoryUsage: 0, diskUsage: 0, lastHeartbeat: n.lastHeartbeat,
        };
      }
      if (n.status === "MAINTENANCE") {
        return {
          id: n.id, uuid: n.uuid, name: n.name, location: n.location.name, locationId: n.locationId, hostname: n.hostname,
          fqdn: n.fqdn, ipAddress: n.ipAddress, port: n.port, protocol: n.protocol,
          memoryMb: n.memoryMb, diskMb: n.diskMb, cpuCores: n.cpuCores,
          serverCount: n._count.servers, allocationCount: n._count.allocations, usesMockProvider: n.usesMockProvider,
          isEnabled: true, maintenanceReason: n.maintenanceReason,
          status: "MAINTENANCE", cpuUsage: 0, memoryUsage: 0, diskUsage: 0, lastHeartbeat: n.lastHeartbeat,
        };
      }
      // A node with a real Agent registered (usesMockProvider=false)
      // reports status from heartbeat freshness per
      // CLOUDN_AGENT_INTEGRATION.md §5 — the Panel marks it OFFLINE once
      // its last heartbeat is older than 3×HEARTBEAT_INTERVAL_MS, rather
      // than asking the mock provider, which only knows about nodes still
      // on it.
      if (!n.usesMockProvider) {
        const isFresh = n.lastHeartbeat && Date.now() - n.lastHeartbeat.getTime() < HEARTBEAT_STALE_THRESHOLD_MS;
        return {
          id: n.id, uuid: n.uuid, name: n.name, location: n.location.name, locationId: n.locationId, hostname: n.hostname,
          fqdn: n.fqdn, ipAddress: n.ipAddress, port: n.port, protocol: n.protocol,
          memoryMb: n.memoryMb, diskMb: n.diskMb, cpuCores: n.cpuCores,
          serverCount: n._count.servers, allocationCount: n._count.allocations, usesMockProvider: n.usesMockProvider,
          isEnabled: true, maintenanceReason: null,
          status: isFresh ? "ONLINE" : "OFFLINE",
          cpuUsage: n.cpuUsage ?? 0, memoryUsage: n.memoryUsage ?? 0, diskUsage: n.diskUsage ?? 0,
          lastHeartbeat: n.lastHeartbeat,
        };
      }
      const status = await infrastructureProvider.getNodeStatus(n.id);
      return {
        id: n.id,
        uuid: n.uuid,
        name: n.name,
        location: n.location.name,
        locationId: n.locationId,
        hostname: n.hostname,
        fqdn: n.fqdn,
        ipAddress: n.ipAddress,
        port: n.port,
        protocol: n.protocol,
        memoryMb: n.memoryMb,
        diskMb: n.diskMb,
        cpuCores: n.cpuCores,
        serverCount: n._count.servers,
        allocationCount: n._count.allocations,
        usesMockProvider: n.usesMockProvider,
        isEnabled: true,
        maintenanceReason: null,
        status: status.status,
        cpuUsage: status.cpuUsage,
        memoryUsage: status.memoryUsage,
        diskUsage: status.diskUsage,
        lastHeartbeat: status.lastHeartbeat,
      };
    })
  );

  return ok(res, withStatus);
});

nodesRouter.get("/:id", requireRole("STAFF"), async (req, res) => {
  const node = await prisma.node.findUnique({
    where: { id: req.params.id },
    include: { location: true, allocations: true },
  });
  if (!node) return fail(res, 404, ErrorCodes.NOT_FOUND, "Node not found");
  const status = await infrastructureProvider.getNodeStatus(node.id);
  return ok(res, { ...node, liveStatus: status });
});

const nodeSchema = z.object({
  name: z.string().min(2).max(64),
  description: z.string().max(500).optional(),
  locationId: z.string().uuid(),
  hostname: z.string().min(2),
  fqdn: z.string().optional(),
  ipAddress: z.string().min(3),
  port: z.number().int().min(1).max(65535).default(8080),
  sftpPort: z.number().int().min(1).max(65535).default(2022),
  protocol: z.enum(["HTTP", "HTTPS"]).default("HTTPS"),
  memoryMb: z.number().int().positive(),
  diskMb: z.number().int().positive(),
  cpuCores: z.number().int().positive(),
});

function generateSecret() {
  return crypto.randomBytes(32).toString("base64url");
}

nodesRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = nodeSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);

  const node = await prisma.node.create({ data: parsed.data });

  // Node credentials are generated with CSPRNG and stored as reversible
  // ciphertext (see utils/node-credential-crypto.ts for why a one-way hash
  // isn't sufficient here) plus a 4-char preview for identification. The
  // plaintext is only ever handed back over the API at creation/rotation
  // time — never in a subsequent GET.
  const secret = generateSecret();
  const secretCiphertext = encryptSecret(secret);
  await prisma.nodeCredential.create({
    data: { nodeId: node.id, secretCiphertext, secretPreview: secret.slice(-4) },
  });

  await logAudit({ actorId: req.user!.id, action: "NODE_CREATED", target: node.id, ip: req.ip });

  // Secret is returned exactly once, at creation time.
  return ok(
    res,
    {
      node,
      credentials: {
        nodeId: node.id,
        nodeUuid: node.uuid,
        nodeSecret: secret,
        config: {
          CLOUDN_PANEL_URL: process.env.API_URL ?? "https://panel.example.com",
          CLOUDN_NODE_ID: node.id,
          CLOUDN_NODE_SECRET: secret,
        },
      },
    },
    201
  );
});

nodesRouter.post("/:id/regenerate-secret", requireRole("ADMIN"), async (req, res) => {
  const node = await prisma.node.findUnique({ where: { id: req.params.id } });
  if (!node) return fail(res, 404, ErrorCodes.NOT_FOUND, "Node not found");

  const secret = generateSecret();
  const secretCiphertext = encryptSecret(secret);
  await prisma.nodeCredential.upsert({
    where: { nodeId: node.id },
    update: { secretCiphertext, secretPreview: secret.slice(-4), rotatedAt: new Date() },
    create: { nodeId: node.id, secretCiphertext, secretPreview: secret.slice(-4) },
  });

  await logAudit({ actorId: req.user!.id, action: "NODE_SECRET_REGENERATED", target: node.id, ip: req.ip });
  return ok(res, { nodeId: node.id, nodeSecret: secret });
});

nodesRouter.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = nodeSchema.partial().safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);
  const node = await prisma.node.update({ where: { id: req.params.id }, data: parsed.data }).catch(() => null);
  if (!node) return fail(res, 404, ErrorCodes.NOT_FOUND, "Node not found");
  await logAudit({ actorId: req.user!.id, action: "NODE_UPDATED", target: node.id, ip: req.ip });
  return ok(res, node);
});

// Enable/disable: a disabled node accepts no new servers and reports
// OFFLINE regardless of what the (mock or real) provider says — this is a
// panel-level override, separate from actual connectivity.
nodesRouter.post("/:id/enable", requireRole("ADMIN"), async (req, res) => {
  const node = await prisma.node.update({ where: { id: req.params.id }, data: { isEnabled: true } }).catch(() => null);
  if (!node) return fail(res, 404, ErrorCodes.NOT_FOUND, "Node not found");
  await logAudit({ actorId: req.user!.id, action: "NODE_ENABLED", target: node.id, ip: req.ip });
  return ok(res, node);
});

nodesRouter.post("/:id/disable", requireRole("ADMIN"), async (req, res) => {
  const node = await prisma.node.update({ where: { id: req.params.id }, data: { isEnabled: false } }).catch(() => null);
  if (!node) return fail(res, 404, ErrorCodes.NOT_FOUND, "Node not found");
  await logAudit({ actorId: req.user!.id, action: "NODE_DISABLED", target: node.id, ip: req.ip });
  return ok(res, node);
});

const maintenanceSchema = z.object({ reason: z.string().max(500).optional() });

nodesRouter.post("/:id/maintenance", requireRole("ADMIN"), async (req, res) => {
  const parsed = maintenanceSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Invalid input");
  const node = await prisma.node
    .update({
      where: { id: req.params.id },
      data: { status: "MAINTENANCE", maintenanceReason: parsed.data.reason ?? null },
    })
    .catch(() => null);
  if (!node) return fail(res, 404, ErrorCodes.NOT_FOUND, "Node not found");
  await logAudit({ actorId: req.user!.id, action: "NODE_MAINTENANCE_ENABLED", target: node.id, metadata: { reason: parsed.data.reason }, ip: req.ip });
  return ok(res, node);
});

nodesRouter.post("/:id/maintenance/clear", requireRole("ADMIN"), async (req, res) => {
  const node = await prisma.node
    .update({ where: { id: req.params.id }, data: { status: "UNKNOWN", maintenanceReason: null } })
    .catch(() => null);
  if (!node) return fail(res, 404, ErrorCodes.NOT_FOUND, "Node not found");
  await logAudit({ actorId: req.user!.id, action: "NODE_MAINTENANCE_CLEARED", target: node.id, ip: req.ip });
  return ok(res, node);
});

nodesRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.node.delete({ where: { id: req.params.id } }).catch(() => null);
  await logAudit({ actorId: req.user!.id, action: "NODE_DELETED", target: req.params.id, ip: req.ip });
  return ok(res, { deleted: true });
});
