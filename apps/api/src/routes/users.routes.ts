import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail, ErrorCodes } from "../utils/response.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { hashPassword } from "../auth/auth.service.js";
import { logAudit } from "../services/audit.service.js";
import { getRemainingResources } from "../services/resource-accounting.service.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

// List/search/filter users — admin only.
usersRouter.get("/", requireRole("STAFF"), async (req, res) => {
  const { q, role, status, page = "1", pageSize = "20" } = req.query as Record<string, string>;
  const take = Math.min(100, parseInt(pageSize) || 20);
  const skip = (Math.max(1, parseInt(page) || 1) - 1) * take;

  const where: any = {};
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { username: { contains: q, mode: "insensitive" } },
    ];
  }
  if (role) where.role = role;
  if (status) where.status = status;

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: { plan: true, _count: { select: { servers: true } } },
    }),
  ]);

  return ok(res, {
    items: users.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      status: u.status,
      plan: u.plan?.name ?? null,
      serverCount: u._count.servers,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    })),
    total,
    page: Number(page),
    pageSize: take,
  });
});

usersRouter.get("/:id", requireRole("STAFF"), async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      plan: true,
      servers: { select: { id: true, name: true, status: true, identifier: true } },
    },
  });
  if (!user) return fail(res, 404, ErrorCodes.NOT_FOUND, "User not found");
  const remaining = await getRemainingResources(user.id);
  return ok(res, {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    status: user.status,
    plan: user.plan,
    servers: user.servers,
    remaining,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  });
});

const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
  role: z.enum(["USER", "STAFF", "ADMIN", "SUPER_ADMIN"]).default("USER"),
  planId: z.string().uuid().optional(),
});

usersRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);

  // Only SUPER_ADMIN can create other admins.
  if (["ADMIN", "SUPER_ADMIN"].includes(parsed.data.role) && req.user!.role !== "SUPER_ADMIN") {
    return fail(res, 403, ErrorCodes.UNAUTHORIZED, "Only a super admin can assign admin roles");
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: parsed.data.email }, { username: parsed.data.username }] },
  });
  if (existing) return fail(res, 409, ErrorCodes.CONFLICT, "Email or username already in use");

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      username: parsed.data.username,
      passwordHash,
      role: parsed.data.role,
      planId: parsed.data.planId,
    },
  });
  await logAudit({ actorId: req.user!.id, action: "USER_CREATED", target: user.id, ip: req.ip });
  return ok(res, { id: user.id }, 201);
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(3).max(32).optional(),
  role: z.enum(["USER", "STAFF", "ADMIN", "SUPER_ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED", "DISABLED"]).optional(),
  planId: z.string().uuid().nullable().optional(),
});

usersRouter.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);

  if (parsed.data.role && ["ADMIN", "SUPER_ADMIN"].includes(parsed.data.role) && req.user!.role !== "SUPER_ADMIN") {
    return fail(res, 403, ErrorCodes.UNAUTHORIZED, "Only a super admin can assign admin roles");
  }

  const user = await prisma.user.update({ where: { id: req.params.id }, data: parsed.data }).catch(() => null);
  if (!user) return fail(res, 404, ErrorCodes.NOT_FOUND, "User not found");

  await logAudit({
    actorId: req.user!.id,
    action: "USER_UPDATED",
    target: user.id,
    metadata: parsed.data,
    ip: req.ip,
  });
  return ok(res, { id: user.id });
});

usersRouter.post("/:id/suspend", requireRole("ADMIN"), async (req, res) => {
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { status: "SUSPENDED" } }).catch(() => null);
  if (!user) return fail(res, 404, ErrorCodes.NOT_FOUND, "User not found");
  await logAudit({ actorId: req.user!.id, action: "USER_SUSPENDED", target: user.id, ip: req.ip });
  return ok(res, { id: user.id });
});

usersRouter.post("/:id/unsuspend", requireRole("ADMIN"), async (req, res) => {
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { status: "ACTIVE" } }).catch(() => null);
  if (!user) return fail(res, 404, ErrorCodes.NOT_FOUND, "User not found");
  await logAudit({ actorId: req.user!.id, action: "USER_UNSUSPENDED", target: user.id, ip: req.ip });
  return ok(res, { id: user.id });
});

// Ban is distinct from suspend: banned accounts are treated as a permanent
// enforcement action (e.g. abuse) rather than a temporary hold, but both use
// the same UserStatus enum so authorization checks stay in one place.
usersRouter.post("/:id/ban", requireRole("ADMIN"), async (req, res) => {
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { status: "BANNED" } }).catch(() => null);
  if (!user) return fail(res, 404, ErrorCodes.NOT_FOUND, "User not found");
  await logAudit({ actorId: req.user!.id, action: "USER_BANNED", target: user.id, ip: req.ip });
  return ok(res, { id: user.id });
});

usersRouter.post("/:id/unban", requireRole("ADMIN"), async (req, res) => {
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { status: "ACTIVE" } }).catch(() => null);
  if (!user) return fail(res, 404, ErrorCodes.NOT_FOUND, "User not found");
  await logAudit({ actorId: req.user!.id, action: "USER_UNBANNED", target: user.id, ip: req.ip });
  return ok(res, { id: user.id });
});

usersRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.user.delete({ where: { id: req.params.id } }).catch(() => null);
  await logAudit({ actorId: req.user!.id, action: "USER_DELETED", target: req.params.id, ip: req.ip });
  return ok(res, { deleted: true });
});

const resetPasswordSchema = z.object({ newPassword: z.string().min(8).max(128) });

usersRouter.post("/:id/reset-password", requireRole("ADMIN"), async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Password must be at least 8 characters");
  const passwordHash = await hashPassword(parsed.data.newPassword);
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash } }).catch(() => null);
  if (!user) return fail(res, 404, ErrorCodes.NOT_FOUND, "User not found");
  await logAudit({ actorId: req.user!.id, action: "USER_PASSWORD_RESET", target: user.id, ip: req.ip });
  return ok(res, { reset: true });
});
