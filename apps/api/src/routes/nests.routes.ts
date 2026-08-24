import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail, ErrorCodes } from "../utils/response.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { logAudit } from "../services/audit.service.js";

export const nestsRouter = Router();
nestsRouter.use(requireAuth);

nestsRouter.get("/", async (_req, res) => {
  const nests = await prisma.nest.findMany({
    include: { eggs: { select: { id: true, name: true, slug: true, isBuiltIn: true } } },
    orderBy: { name: "asc" },
  });
  return ok(res, nests);
});

const schema = z.object({
  name: z.string().min(2).max(64),
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
});

nestsRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);
  const nest = await prisma.nest.create({ data: parsed.data }).catch(() => null);
  if (!nest) return fail(res, 409, ErrorCodes.CONFLICT, "Nest name/slug already exists");
  await logAudit({ actorId: req.user!.id, action: "NEST_CREATED", target: nest.id, ip: req.ip });
  return ok(res, nest, 201);
});

nestsRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.nest.delete({ where: { id: req.params.id } }).catch(() => null);
  return ok(res, { deleted: true });
});
