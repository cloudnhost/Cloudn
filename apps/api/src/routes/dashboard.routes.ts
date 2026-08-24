import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok } from "../utils/response.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { getRemainingResources } from "../services/resource-accounting.service.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/", async (req, res) => {
  const user = req.user!;
  const isStaff = ["STAFF", "ADMIN", "SUPER_ADMIN"].includes(user.role);

  if (!isStaff) {
    const servers = await prisma.server.findMany({
      where: { ownerId: user.id },
      include: { egg: { select: { name: true } }, node: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    const running = servers.filter((s) => s.status === "ONLINE").length;
    const stopped = servers.filter((s) => s.status === "OFFLINE").length;
    const remaining = await getRemainingResources(user.id);
    const activity = await prisma.activity.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return ok(res, {
      role: "USER",
      servers,
      runningServers: running,
      stoppedServers: stopped,
      remaining,
      recentActivity: activity,
    });
  }

  const [totalUsers, totalServers, runningServers, nodes, recentServers, recentUsers, activity] =
    await Promise.all([
      prisma.user.count(),
      prisma.server.count(),
      prisma.server.count({ where: { status: "ONLINE" } }),
      prisma.node.findMany(),
      prisma.server.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { owner: { select: { username: true } } } }),
      prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
      prisma.activity.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    ]);

  const onlineNodes = nodes.filter((n) => n.status !== "OFFLINE").length;

  const plans = await prisma.plan.findMany();
  const servers = await prisma.server.findMany();
  const cpuAllocated = servers.reduce((a, s) => a + s.cpuLimit, 0);
  const ramAllocated = servers.reduce((a, s) => a + s.ramLimitMb, 0);
  const diskAllocated = servers.reduce((a, s) => a + s.diskLimitMb, 0);
  const cpuCapacity = nodes.reduce((a, n) => a + n.cpuCores * 100, 0) || 1;
  const ramCapacity = nodes.reduce((a, n) => a + n.memoryMb, 0) || 1;
  const diskCapacity = nodes.reduce((a, n) => a + n.diskMb, 0) || 1;

  return ok(res, {
    role: "ADMIN",
    totalUsers,
    totalServers,
    runningServers,
    totalNodes: nodes.length,
    onlineNodes,
    offlineNodes: nodes.length - onlineNodes,
    cpuAllocationPercent: Math.round((cpuAllocated / cpuCapacity) * 100),
    ramAllocationPercent: Math.round((ramAllocated / ramCapacity) * 100),
    storageAllocationPercent: Math.round((diskAllocated / diskCapacity) * 100),
    recentServers,
    recentUsers,
    nodeStatus: nodes.map((n) => ({ id: n.id, name: n.name, status: n.status })),
    recentActivity: activity,
    planCount: plans.length,
  });
});
