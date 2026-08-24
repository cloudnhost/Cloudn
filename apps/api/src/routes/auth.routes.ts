import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail, ErrorCodes } from "../utils/response.js";
import {
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from "../auth/auth.service.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { logAudit, logActivity } from "../services/audit.service.js";

export const authRouter = Router();

const COOKIE_NAME = "cloudn_session";

// Cross-site by default: the web app and API are two separate origins on
// the primary (Vercel, two-project) deployment path, so the browser only
// sends this cookie back on API requests if it's SameSite=None —
// SameSite=Lax (the conventional default) is silently dropped on
// cross-site fetches, which would make login appear to "work" (200 OK)
// but every subsequent authenticated request would look logged-out.
// SameSite=None REQUIRES Secure, which requires HTTPS.
//
// That's automatically correct for Vercel (always HTTPS) and for local
// dev (localhost:5173/localhost:4000 are same-site regardless, so Lax is
// fine and Secure would break plain-HTTP localhost). It's NOT
// automatically correct for a self-hosted single-process deployment
// (README's "Self-hosted" section) that hasn't set up HTTPS — same-origin
// there doesn't need SameSite=None at all, and forcing Secure without
// HTTPS would make the browser refuse to store the cookie, breaking
// login outright. SAME_ORIGIN_DEPLOYMENT=true opts out of the
// cross-site cookie policy for exactly that case.
const isProduction = process.env.NODE_ENV === "production";
const isSameOriginDeployment = process.env.SAME_ORIGIN_DEPLOYMENT === "true";
const useCrossSiteCookiePolicy = isProduction && !isSameOriginDeployment;
const cookieOpts = {
  httpOnly: true,
  sameSite: useCrossSiteCookiePolicy ? ("none" as const) : ("lax" as const),
  secure: useCrossSiteCookiePolicy,
  maxAge: 1000 * 60 * 60 * 24 * 7,
};

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
});

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);
  }
  const { email, username, password } = parsed.data;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    return fail(res, 409, ErrorCodes.CONFLICT, "Email or username already in use");
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, username, passwordHash },
  });

  await logAudit({ actorId: user.id, action: "USER_CREATED", target: user.id, ip: req.ip });
  await logActivity({ userId: user.id, type: "USER_CREATED", message: `${username} registered` });

  const token = await createSession(user.id, req.ip, req.headers["user-agent"]);
  res.cookie(COOKIE_NAME, token, cookieOpts);
  return ok(res, { id: user.id, email: user.email, username: user.username, role: user.role }, 201);
});

const loginSchema = z.object({
  identifier: z.string().min(1), // email or username
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Email/username and password required");
  }
  const { identifier, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
  });

  // Deliberately identical error for unknown user vs bad password, so login
  // can't be used to enumerate accounts.
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    return fail(res, 401, ErrorCodes.UNAUTHENTICATED, "Invalid credentials");
  }
  if (user.status !== "ACTIVE") {
    const reason = user.status === "BANNED" ? "Account is banned" : user.status === "SUSPENDED" ? "Account is suspended" : "Account is disabled";
    return fail(res, 403, ErrorCodes.UNAUTHORIZED, reason);
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logAudit({ actorId: user.id, action: "USER_LOGIN", target: user.id, ip: req.ip });

  const token = await createSession(user.id, req.ip, req.headers["user-agent"]);
  res.cookie(COOKIE_NAME, token, cookieOpts);
  return ok(res, { id: user.id, email: user.email, username: user.username, role: user.role });
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) await destroySession(token);
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: cookieOpts.sameSite, secure: cookieOpts.secure });
  return ok(res, { loggedOut: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const u = req.user!;
  return ok(res, {
    id: u.id,
    email: u.email,
    username: u.username,
    role: u.role,
    status: u.status,
    planId: u.planId,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Invalid input");
  }
  const user = req.user!;
  const valid = await verifyPassword(user.passwordHash, parsed.data.currentPassword);
  if (!valid) return fail(res, 401, ErrorCodes.UNAUTHENTICATED, "Current password is incorrect");

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await logAudit({ actorId: user.id, action: "PASSWORD_CHANGED", target: user.id, ip: req.ip });
  return ok(res, { changed: true });
});
