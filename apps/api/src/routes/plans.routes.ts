import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail, ErrorCodes } from "../utils/response.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { logAudit } from "../services/audit.service.js";

export const plansRouter = Router();

// Public (unauthenticated): the marketing site's Plans page reads live from
// the database, never a hardcoded list, but only ever shows active plans.
plansRouter.get("/public", async (_req, res) => {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { price: "asc" },
  });
  return ok(res, plans);
});

plansRouter.use(requireAuth);

plansRouter.get("/", async (req, res) => {
  const isStaff = ["STAFF", "ADMIN", "SUPER_ADMIN"].includes(req.user!.role);
  const { includeHidden } = req.query as Record<string, string>;
  const where = isStaff && includeHidden === "true" ? {} : { isActive: true };
  const plans = await prisma.plan.findMany({
    where,
    orderBy: { price: "asc" },
    include: { planEggs: { include: { egg: true } }, planNodes: { include: { node: true } } },
  });
  return ok(res, plans);
});

const planSchema = z.object({
  name: z.string().min(2).max(64),
  description: z.string().max(500).optional(),
  price: z.number().min(0).default(0),
  currency: z.string().default("USD"),
  billingInterval: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "ONE_TIME"]).default("MONTHLY"),
  cpuPercent: z.number().int().positive(),
  ramMb: z.number().int().positive(),
  diskMb: z.number().int().positive(),
  swapMb: z.number().int().min(0).default(0),
  maxServers: z.number().int().min(0),
  maxDatabases: z.number().int().min(0).default(0),
  maxBackups: z.number().int().min(0).default(0),
  maxAllocations: z.number().int().min(0).default(1),
  priority: z.number().int().default(0),
  eggAccessMode: z.enum(["ALL", "ALLOW_LIST"]).default("ALL"),
  nodeAccessMode: z.enum(["ALL", "ALLOW_LIST"]).default("ALL"),
  allowedEggIds: z.array(z.string().uuid()).optional(),
  allowedNodeIds: z.array(z.string().uuid()).optional(),
});

// Plan edits never retroactively touch existing servers — server rows copy
// their resource limits at creation time (see Server model comment). This
// keeps "safe by default": admins must explicitly resize a server.
plansRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);
  const { allowedEggIds, allowedNodeIds, ...data } = parsed.data;

  const plan = await prisma.plan.create({ data });
  if (allowedEggIds?.length) {
    await prisma.planEgg.createMany({ data: allowedEggIds.map((eggId) => ({ planId: plan.id, eggId })) });
  }
  if (allowedNodeIds?.length) {
    await prisma.planNode.createMany({ data: allowedNodeIds.map((nodeId) => ({ planId: plan.id, nodeId })) });
  }

  await logAudit({ actorId: req.user!.id, action: "PLAN_UPDATED", target: plan.id, metadata: { created: true }, ip: req.ip });
  return ok(res, plan, 201);
});

plansRouter.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = planSchema.partial().safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);
  const { allowedEggIds, allowedNodeIds, ...data } = parsed.data;

  const plan = await prisma.plan.update({ where: { id: req.params.id }, data }).catch(() => null);
  if (!plan) return fail(res, 404, ErrorCodes.NOT_FOUND, "Plan not found");

  if (allowedEggIds) {
    await prisma.planEgg.deleteMany({ where: { planId: plan.id } });
    if (allowedEggIds.length) {
      await prisma.planEgg.createMany({ data: allowedEggIds.map((eggId) => ({ planId: plan.id, eggId })) });
    }
  }
  if (allowedNodeIds) {
    await prisma.planNode.deleteMany({ where: { planId: plan.id } });
    if (allowedNodeIds.length) {
      await prisma.planNode.createMany({ data: allowedNodeIds.map((nodeId) => ({ planId: plan.id, nodeId })) });
    }
  }

  await logAudit({ actorId: req.user!.id, action: "PLAN_UPDATED", target: plan.id, ip: req.ip });
  return ok(res, plan);
});

plansRouter.post("/:id/hide", requireRole("ADMIN"), async (req, res) => {
  const plan = await prisma.plan.update({ where: { id: req.params.id }, data: { isActive: false } }).catch(() => null);
  if (!plan) return fail(res, 404, ErrorCodes.NOT_FOUND, "Plan not found");
  await logAudit({ actorId: req.user!.id, action: "PLAN_HIDDEN", target: plan.id, ip: req.ip });
  return ok(res, plan);
});

plansRouter.post("/:id/unhide", requireRole("ADMIN"), async (req, res) => {
  const plan = await prisma.plan.update({ where: { id: req.params.id }, data: { isActive: true } }).catch(() => null);
  if (!plan) return fail(res, 404, ErrorCodes.NOT_FOUND, "Plan not found");
  await logAudit({ actorId: req.user!.id, action: "PLAN_UNHIDDEN", target: plan.id, ip: req.ip });
  return ok(res, plan);
});

plansRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  // Users/servers referencing this plan are not broken by deletion — the
  // relation is onDelete: SetNull, and servers already carry their own
  // copied resource limits independent of the plan row.
  const deleted = await prisma.plan.delete({ where: { id: req.params.id } }).catch(() => null);
  if (!deleted) return fail(res, 404, ErrorCodes.NOT_FOUND, "Plan not found");
  await logAudit({ actorId: req.user!.id, action: "PLAN_DELETED", target: req.params.id, ip: req.ip });
  return ok(res, { deleted: true });
});
