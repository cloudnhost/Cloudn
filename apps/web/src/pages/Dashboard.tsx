import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Server, Users, HardDrive, Cpu, MemoryStick, Database, Plus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { PageHeader, StatCard, StatusBadge, Loading, ResourceBar, EmptyState } from "../components/ui";

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<any>("/dashboard"),
    refetchInterval: 8000,
  });

  if (isLoading || !data) return <Loading />;

  if (data.role === "USER") {
    return (
      <div className="p-8">
        <PageHeader
          title={`Welcome back, ${user?.username}`}
          subtitle="Here's what's happening with your servers"
          actions={
            <Link to="/app/servers/new" className="btn-primary">
              <Plus size={15} /> Create Server
            </Link>
          }
        />

        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Servers" value={data.servers.length} icon={Server} />
          <StatCard label="Running" value={data.runningServers} icon={Cpu} />
          <StatCard label="Stopped" value={data.stoppedServers} icon={HardDrive} />
          <StatCard label="RAM Remaining" value={data.remaining ? `${data.remaining.ramMb} MB` : "—"} icon={MemoryStick} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Your Servers</h2>
            {data.servers.length === 0 ? (
              <EmptyState
                title="No servers yet"
                subtitle="Create your first server to get started."
                action={
                  <Link to="/app/servers/new" className="btn-primary">
                    <Plus size={15} /> Create Server
                  </Link>
                }
              />
            ) : (
              <div className="card divide-y divide-white/5">
                {data.servers.slice(0, 6).map((s: any) => (
                  <Link key={s.id} to={`/app/servers/${s.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-white/5">
                    <div>
                      <div className="text-sm font-medium text-slate-200">{s.name}</div>
                      <div className="text-xs text-slate-500">
                        {s.egg?.name} · {s.node?.name}
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Recent Activity</h2>
            <div className="card divide-y divide-white/5">
              {data.recentActivity.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-500">No activity yet</div>
              ) : (
                data.recentActivity.map((a: any) => (
                  <div key={a.id} className="px-4 py-3">
                    <div className="text-sm text-slate-300">{a.message}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{new Date(a.createdAt).toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <PageHeader title="Admin Overview" subtitle="Platform-wide status at a glance" />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Users" value={data.totalUsers} icon={Users} />
        <StatCard label="Total Servers" value={data.totalServers} icon={Server} />
        <StatCard label="Running Servers" value={data.runningServers} icon={Cpu} />
        <StatCard label="Nodes" value={`${data.onlineNodes}/${data.totalNodes} online`} icon={HardDrive} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card p-4">
          <ResourceBar label="CPU Allocation" percent={data.cpuAllocationPercent} />
        </div>
        <div className="card p-4">
          <ResourceBar label="RAM Allocation" percent={data.ramAllocationPercent} />
        </div>
        <div className="card p-4">
          <ResourceBar label="Storage Allocation" percent={data.storageAllocationPercent} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Recent Server Creation</h2>
          <div className="card divide-y divide-white/5">
            {data.recentServers.map((s: any) => (
              <Link key={s.id} to={`/app/servers/${s.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-white/5">
                <div>
                  <div className="text-sm font-medium text-slate-200">{s.name}</div>
                  <div className="text-xs text-slate-500">{s.owner?.username}</div>
                </div>
                <StatusBadge status={s.status} />
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Recent Users</h2>
          <div className="card divide-y divide-white/5">
            {data.recentUsers.map((u: any) => (
              <Link key={u.id} to={`/app/admin/users/${u.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-white/5">
                <div>
                  <div className="text-sm font-medium text-slate-200">{u.username}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </div>
                <StatusBadge status={u.status} />
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Node Status</h2>
          <div className="card divide-y divide-white/5">
            {data.nodeStatus.map((n: any) => (
              <div key={n.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-slate-200">{n.name}</span>
                <StatusBadge status={n.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
