import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "../lib/prisma.js";
import { ok, fail, ErrorCodes } from "../utils/response.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { logAudit, logActivity } from "../services/audit.service.js";
import {
  checkServerCreationAllowed,
  checkResourceUpdateAllowed,
  checkAllocationRequestAllowed,
  getRemainingResources,
} from "../services/resource-accounting.service.js";
import { infrastructureProvider, fileProvider } from "../providers/index.js";
import { resolveEgg, EggResolutionError } from "../services/egg-resolver.service.js";
import argon2 from "argon2";
import crypto from "node:crypto";

export const serversRouter = Router();
serversRouter.use(requireAuth);

// Users only ever see their own servers; admins/staff see everything.
serversRouter.get("/", async (req, res) => {
  const isStaff = ["STAFF", "ADMIN", "SUPER_ADMIN"].includes(req.user!.role);
  const { ownerId, page = "1", pageSize = "20" } = req.query as Record<string, string>;
  const take = Math.min(100, parseInt(pageSize) || 20);
  const skip = (Math.max(1, parseInt(page) || 1) - 1) * take;

  const where: any = {};
  if (!isStaff) {
    where.ownerId = req.user!.id;
  } else if (ownerId) {
    where.ownerId = ownerId;
  }

  const [total, servers] = await Promise.all([
    prisma.server.count({ where }),
    prisma.server.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: {
        egg: { select: { name: true } },
        node: { select: { name: true } },
        owner: { select: { username: true } },
        primaryAllocation: true,
      },
    }),
  ]);

  return ok(res, { items: servers, total, page: Number(page), pageSize: take });
});

async function loadServerOr404(req: any, res: any) {
  const server = await prisma.server.findUnique({
    where: { id: req.params.id },
    include: {
      egg: true,
      node: true,
      owner: { select: { id: true, username: true, email: true } },
      allocations: true,
      primaryAllocation: true,
      variables: { include: { eggVariable: true } },
    },
  });
  if (!server) {
    fail(res, 404, ErrorCodes.NOT_FOUND, "Server not found");
    return null;
  }
  const isStaff = ["STAFF", "ADMIN", "SUPER_ADMIN"].includes(req.user!.role);
  if (!isStaff && server.ownerId !== req.user!.id) {
    fail(res, 403, ErrorCodes.UNAUTHORIZED, "Not your server");
    return null;
  }
  return server;
}

// IMPORTANT: registered before GET "/:id" — Express matches routes in
// registration order, and "/:id" would otherwise swallow a literal
// "/remaining-resources" request by binding id="remaining-resources".
// Any future literal-path GET/POST/etc. on this router must go above the
// "/:id" catch-all for the same reason.
serversRouter.get("/remaining-resources", async (req, res) => {
  const remaining = await getRemainingResources(req.user!.id);
  return ok(res, remaining);
});

serversRouter.get("/remaining-resources/:userId", requireRole("STAFF"), async (req, res) => {
  const remaining = await getRemainingResources(req.params.userId);
  return ok(res, remaining);
});

serversRouter.get("/:id", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  return ok(res, server);
});

// ── Server creation wizard ────────────────────────────────────────────────
const createServerSchema = z.object({
  name: z.string().min(2).max(64),
  description: z.string().max(500).optional(),
  ownerId: z.string().uuid().optional(), // admin-only: create for another user
  nodeId: z.string().uuid(),
  eggId: z.string().uuid(),
  allocationId: z.string().uuid(),
  dockerImageLabel: z.string().optional(),
  variables: z.record(z.string()).default({}),

  // Resources are always explicit — there is no implicit "grant the
  // whole plan" fallback. The wizard's Resources step (or the admin form)
  // is expected to default these to something sane and cap them at the
  // owner's remaining quota, but the server enforces the real limit
  // regardless of what the client sends.
  cpuLimit: z.number().int().positive(),
  ramLimitMb: z.number().int().positive(),
  diskLimitMb: z.number().int().positive(),
  swapMb: z.number().int().min(0).default(0),

  // Admin-only: exclude this server from the owner's plan quota entirely
  // (see Server.countsAgainstPlan in schema.prisma). Silently ignored for
  // non-admin callers — a user can't opt their own server out of their
  // own plan accounting.
  countsAgainstPlan: z.boolean().default(true),
});

serversRouter.post("/", async (req, res) => {
  const parsed = createServerSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);
  const data = parsed.data;

  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(req.user!.role);
  const ownerId = isAdmin && data.ownerId ? data.ownerId : req.user!.id;
  const countsAgainstPlan = isAdmin ? data.countsAgainstPlan : true;

  const owner = await prisma.user.findUnique({ where: { id: ownerId }, include: { plan: true } });
  if (!owner) return fail(res, 404, ErrorCodes.NOT_FOUND, "Owner not found");

  const egg = await prisma.egg.findUnique({ where: { id: data.eggId }, include: { variables: true } });
  if (!egg) return fail(res, 404, ErrorCodes.NOT_FOUND, "Egg not found");

  const node = await prisma.node.findUnique({ where: { id: data.nodeId } });
  if (!node) return fail(res, 404, ErrorCodes.NOT_FOUND, "Node not found");
  if (!node.isEnabled) {
    return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "This node is disabled and cannot accept new servers");
  }
  if (node.status === "MAINTENANCE") {
    return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "This node is under maintenance and cannot accept new servers");
  }

  const allocation = await prisma.allocation.findUnique({ where: { id: data.allocationId } });
  if (!allocation || allocation.nodeId !== node.id) {
    return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Allocation is invalid for this node");
  }
  if (allocation.status !== "AVAILABLE") {
    return fail(res, 409, ErrorCodes.CONFLICT, "Allocation already assigned");
  }

  // Quota enforcement only applies when this server counts against the
  // plan — an admin who's explicitly excluded it also isn't bound by it.
  // This is the ONLY path that skips the quota check; nothing else does.
  if (countsAgainstPlan) {
    const check = await checkServerCreationAllowed(ownerId, {
      cpuLimit: data.cpuLimit,
      ramLimitMb: data.ramLimitMb,
      diskLimitMb: data.diskLimitMb,
      nodeId: node.id,
      eggId: egg.id,
    });
    if (!check.allowed) {
      return fail(res, 400, ErrorCodes.RESOURCE_LIMIT_EXCEEDED, check.reason ?? "Not allowed");
    }
  } else if (!isAdmin) {
    // Defense in depth — the schema/ownerId branch above already prevents
    // this, but never let a non-admin path reach an unchecked create.
    return fail(res, 403, ErrorCodes.UNAUTHORIZED, "Only an admin can exclude a server from plan accounting");
  }

  // Resolve against the exact CLOUDN_EGG_SPEC.md wire format up front —
  // proactive rejection here (missing required var, invalid config path,
  // etc.) mirrors what the real Agent would reject later with EGG_INVALID,
  // so a bad configuration never gets as far as a provisioning call.
  let resolved: ReturnType<typeof resolveEgg>;
  try {
    resolved = resolveEgg({ egg, overrides: data.variables, dockerImageLabel: data.dockerImageLabel });
  } catch (e) {
    const message = e instanceof EggResolutionError ? e.message : "Egg configuration is invalid";
    return fail(res, 422, ErrorCodes.VALIDATION_ERROR, message);
  }
  const dockerImage = resolved.definition.dockerImage;
  const env = resolved.environment;

  const identifier = nanoid(8).toLowerCase();

  const server = await prisma.$transaction(async (tx) => {
    const created = await tx.server.create({
      data: {
        identifier,
        name: data.name,
        description: data.description,
        ownerId,
        nodeId: node.id,
        eggId: egg.id,
        planId: owner.planId ?? undefined,
        status: "CREATING",
        dockerImage,
        startupCommand: egg.startupCommand,
        cpuLimit: data.cpuLimit,
        ramLimitMb: data.ramLimitMb,
        diskLimitMb: data.diskLimitMb,
        swapMb: data.swapMb,
        countsAgainstPlan,
      },
    });

    await tx.allocation.update({
      where: { id: allocation.id },
      data: { status: "ASSIGNED", serverId: created.id, primaryForServerId: created.id },
    });

    for (const v of egg.variables) {
      const value = data.variables[v.envVariable] ?? v.defaultValue;
      await tx.serverVariable.create({
        data: { serverId: created.id, eggVariableId: v.id, value },
      });
    }

    return created;
  });

  await infrastructureProvider.createServer({
    serverId: server.id,
    dockerImage,
    startupCommand: egg.startupCommand,
    installScript: egg.installScript,
    env,
    cpuLimit: data.cpuLimit,
    ramLimitMb: data.ramLimitMb,
    diskLimitMb: data.diskLimitMb,
    primaryPort: allocation.port,
    primaryIp: allocation.ip,
  });

  await logAudit({
    actorId: req.user!.id,
    action: "SERVER_CREATED",
    target: server.id,
    metadata: { ownerId, countsAgainstPlan },
    ip: req.ip,
  });
  await logActivity({ userId: ownerId, type: "SERVER_CREATED", message: `Server "${server.name}" created` });

  return ok(res, server, 201);
});

// ── Lifecycle ──────────────────────────────────────────────────────────────
// Suspension is an admin enforcement action, distinct from a normal stop: a
// suspended server is also stopped in the mock/agent provider, but the
// owner is blocked from starting or restarting it again until an admin
// lifts the suspension. Admins/staff are exempt from this block.
async function lifecycleAction(
  req: any,
  res: any,
  action: "start" | "stop" | "restart" | "kill",
  auditAction: string
) {
  const server = await loadServerOr404(req, res);
  if (!server) return;

  const isStaff = ["STAFF", "ADMIN", "SUPER_ADMIN"].includes(req.user!.role);
  if (server.suspended && !isStaff && (action === "start" || action === "restart")) {
    return fail(
      res,
      403,
      ErrorCodes.UNAUTHORIZED,
      "This server is suspended by an administrator and cannot be started"
    );
  }

  if (action === "start") await infrastructureProvider.startServer(server.id);
  if (action === "stop") await infrastructureProvider.stopServer(server.id);
  if (action === "restart") await infrastructureProvider.restartServer(server.id);
  if (action === "kill") await infrastructureProvider.stopServer(server.id); // mock: kill == immediate stop

  await logAudit({ actorId: req.user!.id, action: auditAction, target: server.id, ip: req.ip });
  return ok(res, { status: "requested" });
}

serversRouter.post("/:id/start", (req, res) => lifecycleAction(req, res, "start", "SERVER_STARTED"));
serversRouter.post("/:id/stop", (req, res) => lifecycleAction(req, res, "stop", "SERVER_STOPPED"));
serversRouter.post("/:id/restart", (req, res) => lifecycleAction(req, res, "restart", "SERVER_RESTARTED"));
serversRouter.post("/:id/kill", requireRole("STAFF"), (req, res) => lifecycleAction(req, res, "kill", "SERVER_KILLED"));

serversRouter.post("/:id/suspend", requireRole("STAFF"), async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  await infrastructureProvider.stopServer(server.id);
  await prisma.server.update({ where: { id: server.id }, data: { suspended: true } });
  await logAudit({ actorId: req.user!.id, action: "SERVER_SUSPENDED", target: server.id, ip: req.ip });
  return ok(res, { suspended: true });
});

serversRouter.post("/:id/unsuspend", requireRole("STAFF"), async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  await prisma.server.update({ where: { id: server.id }, data: { suspended: false } });
  await logAudit({ actorId: req.user!.id, action: "SERVER_UNSUSPENDED", target: server.id, ip: req.ip });
  return ok(res, { suspended: false });
});

serversRouter.delete("/:id", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  await infrastructureProvider.deleteServer(server.id);
  await fileProvider.deleteAll(server.id);
  await prisma.server.delete({ where: { id: server.id } });
  await logAudit({ actorId: req.user!.id, action: "SERVER_DELETED", target: server.id, ip: req.ip });
  return ok(res, { deleted: true });
});

// ── Console ─────────────────────────────────────────────────────────────
const commandSchema = z.object({ command: z.string().min(1).max(2000) });

serversRouter.post("/:id/console/command", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  const parsed = commandSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Command required");
  await infrastructureProvider.sendCommand(server.id, parsed.data.command);
  return ok(res, { sent: true });
});

serversRouter.get("/:id/console", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  const since = parseInt((req.query.since as string) ?? "0") || 0;
  const lines = await infrastructureProvider.getConsole(server.id, since);
  return ok(res, { lines, nextSince: since + lines.length });
});

serversRouter.get("/:id/resources", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  const resources = await infrastructureProvider.getResources(server.id);
  return ok(res, resources);
});

// Per CLOUDN_AGENT_INTEGRATION.md §7: resource/allocation changes are
// pushed to infrastructure explicitly, admin-only, and audited — never
// inferred from a generic PATCH /servers/:id. The Panel decides the new
// numbers; the provider (mock today, a real Agent tomorrow) just applies
// them.
const updateResourcesSchema = z.object({
  cpuLimit: z.number().int().positive(),
  ramLimitMb: z.number().int().positive(),
  diskLimitMb: z.number().int().positive(),
  swapMb: z.number().int().min(0).default(0),
  // Optional: let an admin flip whether this server counts against the
  // owner's plan at the same time as resizing it. Omit to leave it
  // unchanged.
  countsAgainstPlan: z.boolean().optional(),
});

serversRouter.patch("/:id/resources", requireRole("ADMIN"), async (req, res) => {
  const parsed = updateResourcesSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);

  const server = await prisma.server.findUnique({ where: { id: req.params.id } });
  if (!server) return fail(res, 404, ErrorCodes.NOT_FOUND, "Server not found");

  const willCountAgainstPlan = parsed.data.countsAgainstPlan ?? server.countsAgainstPlan;

  // Same reasoning as creation: quota is only enforced for a server that
  // counts against the plan. Uses the resize-aware check so the server's
  // own current usage isn't double-subtracted against its new size.
  if (willCountAgainstPlan) {
    const check = await checkResourceUpdateAllowed(server.ownerId, {
      serverId: server.id,
      cpuLimit: parsed.data.cpuLimit,
      ramLimitMb: parsed.data.ramLimitMb,
      diskLimitMb: parsed.data.diskLimitMb,
    });
    if (!check.allowed) {
      return fail(res, 400, ErrorCodes.RESOURCE_LIMIT_EXCEEDED, check.reason ?? "Not allowed");
    }
  }

  try {
    await infrastructureProvider.updateResources(server.id, {
      cpuLimit: parsed.data.cpuLimit,
      ramLimitMb: parsed.data.ramLimitMb,
      diskLimitMb: parsed.data.diskLimitMb,
      swapMb: parsed.data.swapMb,
    });
  } catch (e: any) {
    return fail(res, 502, "DOCKER_UNAVAILABLE", e?.message ?? "Failed to apply new resources on the node");
  }

  const updated = await prisma.server.update({
    where: { id: server.id },
    data: { ...parsed.data, countsAgainstPlan: willCountAgainstPlan },
  });
  await logAudit({
    actorId: req.user!.id,
    action: "SERVER_RESOURCES_UPDATED",
    target: server.id,
    metadata: { ...parsed.data, countsAgainstPlan: willCountAgainstPlan },
    ip: req.ip,
  });
  return ok(res, updated);
});

const updateAllocationSchema = z.object({ allocationId: z.string().uuid() });

serversRouter.patch("/:id/allocation", requireRole("ADMIN"), async (req, res) => {
  const parsed = updateAllocationSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "allocationId is required");

  const server = await prisma.server.findUnique({ where: { id: req.params.id }, include: { primaryAllocation: true } });
  if (!server) return fail(res, 404, ErrorCodes.NOT_FOUND, "Server not found");

  const newAllocation = await prisma.allocation.findUnique({ where: { id: parsed.data.allocationId } });
  if (!newAllocation || newAllocation.nodeId !== server.nodeId) {
    return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Allocation must belong to the same node as this server");
  }
  if (newAllocation.status !== "AVAILABLE") {
    return fail(res, 409, ErrorCodes.CONFLICT, "Allocation is already assigned");
  }

  try {
    await infrastructureProvider.updateAllocation(server.id, { ip: newAllocation.ip, port: newAllocation.port });
  } catch (e: any) {
    return fail(res, 502, "DOCKER_UNAVAILABLE", e?.message ?? "Failed to apply new allocation on the node");
  }

  await prisma.$transaction(async (tx) => {
    if (server.primaryAllocation) {
      await tx.allocation.update({
        where: { id: server.primaryAllocation.id },
        data: { status: "AVAILABLE", serverId: null, primaryForServerId: null },
      });
    }
    await tx.allocation.update({
      where: { id: newAllocation.id },
      data: { status: "ASSIGNED", serverId: server.id, primaryForServerId: server.id },
    });
  });

  await logAudit({
    actorId: req.user!.id,
    action: "ALLOCATION_CREATED",
    target: server.id,
    metadata: { newAllocationId: newAllocation.id },
    ip: req.ip,
  });
  return ok(res, { updated: true });
});

// Self-service extra ports: by default a server gets exactly one
// allocation (assigned at creation). A user can request an additional
// one for their own server, bounded by their plan's allocation quota
// (see checkAllocationRequestAllowed); staff can do it for any server.
// This auto-picks the next available allocation on the SAME node as the
// server — it doesn't create new allocations (that's an admin action,
// see allocations.routes.ts).
serversRouter.post("/:id/allocations", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;

  const isStaff = ["STAFF", "ADMIN", "SUPER_ADMIN"].includes(req.user!.role);
  if (server.countsAgainstPlan && !isStaff) {
    const check = await checkAllocationRequestAllowed(server.ownerId);
    if (!check.allowed) {
      return fail(res, 400, ErrorCodes.RESOURCE_LIMIT_EXCEEDED, check.reason ?? "Not allowed");
    }
  }

  const nextAvailable = await prisma.allocation.findFirst({
    where: { nodeId: server.nodeId, status: "AVAILABLE" },
    orderBy: { port: "asc" },
  });
  if (!nextAvailable) {
    return fail(res, 409, ErrorCodes.CONFLICT, "No available ports left on this server's node");
  }

  await prisma.allocation.update({
    where: { id: nextAvailable.id },
    data: { status: "ASSIGNED", serverId: server.id },
  });

  await logAudit({
    actorId: req.user!.id,
    action: "ALLOCATION_CREATED",
    target: server.id,
    metadata: { allocationId: nextAvailable.id, port: nextAvailable.port, requestedBySelf: !isStaff },
    ip: req.ip,
  });

  return ok(res, nextAvailable, 201);
});

// Releases a non-primary allocation back to the pool. The primary
// allocation can't be removed this way — swap it via PATCH
// /:id/allocation instead, since a server always needs at least one port.
serversRouter.delete("/:id/allocations/:allocationId", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;

  const allocation = await prisma.allocation.findUnique({ where: { id: req.params.allocationId } });
  if (!allocation || allocation.serverId !== server.id) {
    return fail(res, 404, ErrorCodes.NOT_FOUND, "Allocation not found on this server");
  }
  if (allocation.primaryForServerId === server.id) {
    return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Cannot remove the primary allocation — reassign it instead");
  }

  await prisma.allocation.update({
    where: { id: allocation.id },
    data: { status: "AVAILABLE", serverId: null },
  });

  await logAudit({ actorId: req.user!.id, action: "ALLOCATION_DELETED", target: server.id, metadata: { allocationId: allocation.id }, ip: req.ip });
  return ok(res, { released: true });
});

// Per §2.2/§7: the browser is meant to open the console WebSocket
// directly against the Agent using a short-lived token, bypassing the
// Panel for the stream itself. For the Mock Provider (no real WS console)
// this returns { available: false } so the frontend keeps using the
// existing REST-polled console instead.
serversRouter.get("/:id/console/token", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;

  try {
    const result = await infrastructureProvider.getConsoleToken(server.id);
    if (!result) return ok(res, { available: false });
    return ok(res, { available: true, ...result });
  } catch (e: any) {
    return fail(res, 502, "DOCKER_UNAVAILABLE", e?.message ?? "Failed to obtain a console token from the node");
  }
});

// ── File Manager ────────────────────────────────────────────────────────
// All routes go through `fileProvider` (mock today, future Agent later) —
// never touch a real filesystem or hardcode file data in the frontend.

serversRouter.get("/:id/files", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  const path = (req.query.path as string) ?? "/";
  const entries = await fileProvider.list(server.id, path);
  return ok(res, { path, entries });
});

serversRouter.get("/:id/files/search", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  const q = (req.query.q as string) ?? "";
  const results = await fileProvider.search(server.id, q);
  return ok(res, results);
});

serversRouter.get("/:id/files/content", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  const path = req.query.path as string;
  if (!path) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "path is required");
  try {
    const content = await fileProvider.read(server.id, path);
    return ok(res, { path, content });
  } catch {
    return fail(res, 404, ErrorCodes.NOT_FOUND, "File not found");
  }
});

const fileWriteSchema = z.object({ path: z.string().min(1), content: z.string() });
serversRouter.put("/:id/files/content", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  const parsed = fileWriteSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "path and content are required");
  await fileProvider.write(server.id, parsed.data.path, parsed.data.content);
  await logAudit({ actorId: req.user!.id, action: "SERVER_FILE_SAVED", target: server.id, metadata: { path: parsed.data.path }, ip: req.ip });
  return ok(res, { saved: true });
});

// Upload: accepts raw text content for the mock provider. A real Agent
// integration would stream multipart/binary uploads through the same path.
serversRouter.post("/:id/files/upload", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  const parsed = fileWriteSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "path and content are required");
  await fileProvider.write(server.id, parsed.data.path, parsed.data.content);
  await logAudit({ actorId: req.user!.id, action: "SERVER_FILE_UPLOADED", target: server.id, metadata: { path: parsed.data.path }, ip: req.ip });
  return ok(res, { uploaded: true });
});

serversRouter.get("/:id/files/download", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  const path = req.query.path as string;
  if (!path) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "path is required");
  try {
    const content = await fileProvider.read(server.id, path);
    return ok(res, { path, content });
  } catch {
    return fail(res, 404, ErrorCodes.NOT_FOUND, "File not found");
  }
});

const folderSchema = z.object({ path: z.string().min(1) });
serversRouter.post("/:id/files/folder", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  const parsed = folderSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "path is required");
  await fileProvider.createFolder(server.id, parsed.data.path);
  return ok(res, { created: true }, 201);
});

const renameSchema = z.object({ path: z.string().min(1), newPath: z.string().min(1) });
serversRouter.post("/:id/files/rename", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  const parsed = renameSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "path and newPath are required");
  await fileProvider.rename(server.id, parsed.data.path, parsed.data.newPath);
  await logAudit({ actorId: req.user!.id, action: "SERVER_FILE_RENAMED", target: server.id, ip: req.ip });
  return ok(res, { renamed: true });
});

serversRouter.delete("/:id/files", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  const path = req.query.path as string;
  if (!path) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "path is required");
  await fileProvider.remove(server.id, path);
  await logAudit({ actorId: req.user!.id, action: "SERVER_FILE_DELETED", target: server.id, metadata: { path }, ip: req.ip });
  return ok(res, { deleted: true });
});

// ── SFTP ────────────────────────────────────────────────────────────────
// Deliberately not faked: no fake SFTP server and no paid third-party
// service. Per CLOUDN_AGENT_INTEGRATION.md §10, the Agent runs the real
// SFTP server but never generates or stores the authoritative password —
// the Panel provisions it and displays it to the user. So the Panel does
// real, useful work here today (generating and storing the credential)
// even though there's no Agent yet to authenticate against it.
function sftpUsernameFor(identifier: string, ownerUsername: string) {
  return `${identifier}.${ownerUsername}`;
}

serversRouter.get("/:id/sftp", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;
  return ok(res, {
    available: false,
    reason: "SFTP is served by the CloudN Agent, which is not deployed yet. Credentials below are provisioned and ready for when it is.",
    host: server.node.hostname,
    port: server.node.sftpPort,
    username: server.sftpUsername ?? sftpUsernameFor(server.identifier, server.owner.username),
    hasCredentials: !!server.sftpUsername,
    credentialsSetAt: server.sftpPasswordSetAt,
  });
});

serversRouter.post("/:id/sftp/rotate-credentials", async (req, res) => {
  const server = await loadServerOr404(req, res);
  if (!server) return;

  const username = sftpUsernameFor(server.identifier, server.owner.username);
  const password = crypto.randomBytes(18).toString("base64url");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await prisma.server.update({
    where: { id: server.id },
    data: { sftpUsername: username, sftpPasswordHash: passwordHash, sftpPasswordSetAt: new Date() },
  });

  await logAudit({ actorId: req.user!.id, action: "SERVER_SFTP_CREDENTIALS_ROTATED", target: server.id, ip: req.ip });

  // Password is returned exactly once, at generation time — identical
  // handling to node secrets.
  return ok(res, {
    host: server.node.hostname,
    port: server.node.sftpPort,
    username,
    password,
  });
});
