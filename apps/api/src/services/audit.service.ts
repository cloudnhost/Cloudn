import { prisma } from "../lib/prisma.js";

// Central place all writes go through so we never scatter ad-hoc logging
// calls (and never accidentally log a secret).
export async function logAudit(params: {
  actorId?: string | null;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      action: params.action,
      target: params.target,
      metadata: params.metadata as any,
      ip: params.ip,
    },
  });
}

export async function logActivity(params: {
  userId?: string | null;
  type: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.activity.create({
    data: {
      userId: params.userId ?? null,
      type: params.type,
      message: params.message,
      metadata: params.metadata as any,
    },
  });
}
