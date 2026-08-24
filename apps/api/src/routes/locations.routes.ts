import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail, ErrorCodes } from "../utils/response.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { logAudit } from "../services/audit.service.js";

export const locationsRouter = Router();
locationsRouter.use(requireAuth);

locationsRouter.get("/", async (_req, res) => {
  const locations = await prisma.location.findMany({
    include: { _count: { select: { nodes: true } } },
    orderBy: { name: "asc" },
  });
  return ok(res, locations.map((l) => ({ ...l, nodeCount: l._count.nodes })));
});

const schema = z.object({
  name: z.string().min(2).max(64),
  code: z.string().min(2).max(16),
  description: z.string().max(500).optional(),
});

locationsRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);
  const location = await prisma.location.create({ data: parsed.data }).catch(() => null);
  if (!location) return fail(res, 409, ErrorCodes.CONFLICT, "Location name/code already exists");
  await logAudit({ actorId: req.user!.id, action: "LOCATION_CREATED", target: location.id, ip: req.ip });
  return ok(res, location, 201);
});

locationsRouter.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);
  const location = await prisma.location.update({ where: { id: req.params.id }, data: parsed.data }).catch(() => null);
  if (!location) return fail(res, 404, ErrorCodes.NOT_FOUND, "Location not found");
  return ok(res, location);
});

locationsRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.location.delete({ where: { id: req.params.id } }).catch(() => null);
  await logAudit({ actorId: req.user!.id, action: "LOCATION_DELETED", target: req.params.id, ip: req.ip });
  return ok(res, { deleted: true });
});
