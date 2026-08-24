import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail, ErrorCodes } from "../utils/response.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { logAudit } from "../services/audit.service.js";

export const allocationsRouter = Router();
allocationsRouter.use(requireAuth);

// Self-service: a user picking a port during server creation needs to see
// which allocations are free on their chosen node, without the full
// admin listing (which exposes every server's assigned port across the
// whole node, staff-only). Requires a nodeId — this never lists "all
// available allocations everywhere".
allocationsRouter.get("/available", async (req, res) => {
  const nodeId = req.query.nodeId as string;
  if (!nodeId) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "nodeId is required");

  const allocations = await prisma.allocation.findMany({
    where: { nodeId, status: "AVAILABLE" },
    orderBy: { port: "asc" },
    take: 100,
    select: { id: true, ip: true, port: true },
  });
  return ok(res, allocations);
});

allocationsRouter.get("/", requireRole("STAFF"), async (req, res) => {
  const { nodeId, status, q, page = "1", pageSize = "50" } = req.query as Record<string, string>;
  const take = Math.min(200, parseInt(pageSize) || 50);
  const skip = (Math.max(1, parseInt(page) || 1) - 1) * take;

  const where: any = {};
  if (nodeId) where.nodeId = nodeId;
  if (status) where.status = status;
  if (q) where.OR = [{ ip: { contains: q } }, { port: { equals: Number(q) || -1 } }];

  const [total, allocations] = await Promise.all([
    prisma.allocation.count({ where }),
    prisma.allocation.findMany({
      where,
      take,
      skip,
      orderBy: [{ ip: "asc" }, { port: "asc" }],
      include: { node: { select: { name: true } }, server: { select: { name: true } } },
    }),
  ]);

  return ok(res, { items: allocations, total, page: Number(page), pageSize: take });
});

const singleSchema = z.object({
  nodeId: z.string().uuid(),
  ip: z.string().min(3),
  port: z.number().int().min(1).max(65535),
});

allocationsRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = singleSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);
  const allocation = await prisma.allocation.create({ data: parsed.data }).catch(() => null);
  if (!allocation) return fail(res, 409, ErrorCodes.CONFLICT, "Allocation already exists");
  await logAudit({ actorId: req.user!.id, action: "ALLOCATION_CREATED", target: allocation.id, ip: req.ip });
  return ok(res, allocation, 201);
});

const bulkSchema = z.object({
  nodeId: z.string().uuid(),
  ip: z.string().min(3),
  portRangeStart: z.number().int().min(1).max(65535),
  portRangeEnd: z.number().int().min(1).max(65535),
});

allocationsRouter.post("/bulk", requireRole("ADMIN"), async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);
  const { nodeId, ip, portRangeStart, portRangeEnd } = parsed.data;

  if (portRangeEnd < portRangeStart) {
    return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Range end must be >= range start");
  }
  if (portRangeEnd - portRangeStart > 5000) {
    return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Range too large (max 5000 ports at once)");
  }

  const ports = Array.from({ length: portRangeEnd - portRangeStart + 1 }, (_, i) => portRangeStart + i);
  const result = await prisma.allocation.createMany({
    data: ports.map((port) => ({ nodeId, ip, port })),
    skipDuplicates: true,
  });

  await logAudit({
    actorId: req.user!.id,
    action: "ALLOCATION_CREATED",
    target: nodeId,
    metadata: { bulk: true, ip, portRangeStart, portRangeEnd, created: result.count },
    ip: req.ip,
  });

  return ok(res, { created: result.count }, 201);
});

allocationsRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.allocation.delete({ where: { id: req.params.id } }).catch(() => null);
  await logAudit({ actorId: req.user!.id, action: "ALLOCATION_DELETED", target: req.params.id, ip: req.ip });
  return ok(res, { deleted: true });
});
