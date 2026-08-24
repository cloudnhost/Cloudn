import type { Request, Response, NextFunction } from "express";
import { getSessionUser } from "../auth/auth.service.js";
import { fail, ErrorCodes } from "../utils/response.js";
import type { Role, User } from "@prisma/client";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const ROLE_RANK: Record<Role, number> = {
  USER: 0,
  STAFF: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

// Every protected route resolves the user from the session cookie on the
// backend. The frontend never gets to assert who it is — hiding a page in
// the UI is not authorization.
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = req.cookies?.cloudn_session;
  const user = await getSessionUser(token);
  if (!user) return fail(res, 401, ErrorCodes.UNAUTHENTICATED, "Not authenticated");
  if (user.status !== "ACTIVE") {
    return fail(res, 403, ErrorCodes.UNAUTHORIZED, "Account is not active");
  }
  req.user = user;
  next();
}

export function requireRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return fail(res, 401, ErrorCodes.UNAUTHENTICATED, "Not authenticated");
    if (ROLE_RANK[req.user.role] < ROLE_RANK[minRole]) {
      return fail(res, 403, ErrorCodes.UNAUTHORIZED, "Insufficient role");
    }
    next();
  };
}
