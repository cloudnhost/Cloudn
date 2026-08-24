import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok } from "../utils/response.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

export const logsRouter = Router();
logsRouter.use(requireAuth);

logsRouter.get("/activity", requireRole("STAFF"), async (req, res) => {
  const { page = "1", pageSize = "30" } = req.query as Record<string, string>;
  const take = Math.min(100, parseInt(pageSize) || 30);
  const skip = (Math.max(1, parseInt(page) || 1) - 1) * take;
  const [total, items] = await Promise.all([
    prisma.activity.count(),
    prisma.activity.findMany({
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { username: true } } },
    }),
  ]);
  return ok(res, { items, total, page: Number(page), pageSize: take });
});

logsRouter.get("/audit", requireRole("ADMIN"), async (req, res) => {
  const { page = "1", pageSize = "30", action } = req.query as Record<string, string>;
  const take = Math.min(100, parseInt(pageSize) || 30);
  const skip = (Math.max(1, parseInt(page) || 1) - 1) * take;
  const where = action ? { action } : {};
  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { username: true } } },
    }),
  ]);
  return ok(res, { items, total, page: Number(page), pageSize: take });
});
