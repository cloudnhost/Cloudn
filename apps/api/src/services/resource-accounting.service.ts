import { prisma } from "../lib/prisma.js";

export interface RemainingResources {
  ramMb: number;
  cpuPercent: number;
  diskMb: number;
  servers: number;
  databases: number;
  backups: number;
  allocations: number;
}

// The single source of truth for "how much of their plan has this user
// used". Every server-creation and resize path (user or admin) must call
// through this — never trust a resource total computed on the frontend.
//
// Only servers with countsAgainstPlan=true are summed. A server an admin
// explicitly excluded from plan accounting (see Server.countsAgainstPlan
// in schema.prisma) is invisible to this calculation in both directions —
// it doesn't reduce what's reported as remaining, and it was never bound
// by this check when it was created or resized.
//
// `excludeServerId` lets a resize check compute "remaining as if this
// server didn't already exist" so the server's *current* usage doesn't
// count against its own *new* requested size.
export async function getRemainingResources(
  userId: string,
  excludeServerId?: string
): Promise<RemainingResources | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { plan: true },
  });
  if (!user?.plan) return null;

  const servers = await prisma.server.findMany({
    where: {
      ownerId: userId,
      countsAgainstPlan: true,
      ...(excludeServerId ? { id: { not: excludeServerId } } : {}),
    },
    include: { allocations: true, databases: true, backups: true },
  });

  // Server count against the plan's maxServers limit still includes every
  // server the user owns regardless of countsAgainstPlan or exclusion —
  // "how many servers can I have" is a slot limit, not a resource pool,
  // and excluding a server from resource accounting doesn't free up a
  // server slot for a different server.
  const totalServerCount = await prisma.server.count({ where: { ownerId: userId } });

  const used = servers.reduce(
    (acc, s) => {
      acc.ramMb += s.ramLimitMb;
      acc.cpuPercent += s.cpuLimit;
      acc.diskMb += s.diskLimitMb;
      acc.allocations += s.allocations.length;
      acc.databases += s.databases.length;
      acc.backups += s.backups.length;
      return acc;
    },
    { ramMb: 0, cpuPercent: 0, diskMb: 0, allocations: 0, databases: 0, backups: 0 }
  );

  const plan = user.plan;
  return {
    ramMb: Math.max(0, plan.ramMb - used.ramMb),
    cpuPercent: Math.max(0, plan.cpuPercent - used.cpuPercent),
    diskMb: Math.max(0, plan.diskMb - used.diskMb),
    servers: Math.max(0, plan.maxServers - totalServerCount),
    databases: Math.max(0, plan.maxDatabases - used.databases),
    backups: Math.max(0, plan.maxBackups - used.backups),
    allocations: Math.max(0, plan.maxAllocations - used.allocations),
  };
}

export interface ServerCreationCheck {
  cpuLimit: number;
  ramLimitMb: number;
  diskLimitMb: number;
  nodeId: string;
  eggId: string;
}

export interface CheckResult {
  allowed: boolean;
  reason?: string;
}

// Enforces every server-creation rule in one place: active account, plan
// quota (RAM/CPU/disk/server count), egg/node allow-lists. Callers that
// set countsAgainstPlan=false on the server skip this function entirely
// (by design — see the route) rather than this function special-casing it.
export async function checkServerCreationAllowed(
  userId: string,
  input: ServerCreationCheck
): Promise<CheckResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { plan: true } });
  if (!user) return { allowed: false, reason: "User not found" };
  if (user.status !== "ACTIVE") return { allowed: false, reason: "Account is not active" };
  if (!user.plan) return { allowed: false, reason: "No plan assigned" };

  const remaining = await getRemainingResources(userId);
  if (!remaining) return { allowed: false, reason: "No plan assigned" };

  if (remaining.servers <= 0) return { allowed: false, reason: "Server quota exceeded" };
  if (input.ramLimitMb > remaining.ramMb) return { allowed: false, reason: "RAM exceeds available plan resources" };
  if (input.cpuLimit > remaining.cpuPercent) return { allowed: false, reason: "CPU exceeds available plan resources" };
  if (input.diskLimitMb > remaining.diskMb) return { allowed: false, reason: "Disk exceeds available plan resources" };

  const plan = user.plan;

  if (plan.eggAccessMode === "ALLOW_LIST") {
    const allowed = await prisma.planEgg.findUnique({
      where: { planId_eggId: { planId: plan.id, eggId: input.eggId } },
    });
    if (!allowed) return { allowed: false, reason: "Egg not allowed on this plan" };
  }

  if (plan.nodeAccessMode === "ALLOW_LIST") {
    const allowed = await prisma.planNode.findUnique({
      where: { planId_nodeId: { planId: plan.id, nodeId: input.nodeId } },
    });
    if (!allowed) return { allowed: false, reason: "Node not allowed on this plan" };
  }

  return { allowed: true };
}

export interface ResourceUpdateCheck {
  serverId: string;
  cpuLimit: number;
  ramLimitMb: number;
  diskLimitMb: number;
}

// Same idea as checkServerCreationAllowed but for resizing a server that
// already exists: computes remaining as if this server's *current* usage
// weren't already subtracted, so a resize that keeps the total the same
// (or shrinks it) is never incorrectly rejected as "exceeding" the quota.
export async function checkResourceUpdateAllowed(
  userId: string,
  input: ResourceUpdateCheck
): Promise<CheckResult> {
  const remaining = await getRemainingResources(userId, input.serverId);
  if (!remaining) return { allowed: true }; // no plan assigned — nothing to enforce

  if (input.ramLimitMb > remaining.ramMb) return { allowed: false, reason: "RAM exceeds available plan resources" };
  if (input.cpuLimit > remaining.cpuPercent) return { allowed: false, reason: "CPU exceeds available plan resources" };
  if (input.diskLimitMb > remaining.diskMb) return { allowed: false, reason: "Disk exceeds available plan resources" };

  return { allowed: true };
}

// Checks whether a user has an available port-allocation slot left on
// their plan before granting an additional (non-primary) allocation to
// one of their servers. Each server gets exactly one allocation at
// creation time (§16 of the original spec: "each user gets 1 port per
// server") — anything beyond that goes through this check.
export async function checkAllocationRequestAllowed(userId: string): Promise<CheckResult> {
  const remaining = await getRemainingResources(userId);
  if (!remaining) return { allowed: false, reason: "No plan assigned" };
  if (remaining.allocations <= 0) return { allowed: false, reason: "Allocation quota exceeded for your plan" };
  return { allowed: true };
}
