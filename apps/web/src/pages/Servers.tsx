import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { PageHeader, StatusBadge, Loading, EmptyState, ErrorState } from "../components/ui";

export default function Servers() {
  const [q, setQ] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.get<any>("/servers?pageSize=100"),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message="Failed to load servers" />;

  const items = (data?.items ?? []).filter((s: any) =>
    s.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="p-8">
      <PageHeader
        title="Servers"
        subtitle={`${data?.total ?? 0} total`}
        actions={
          <Link to="/app/servers/new" className="btn-primary">
            <Plus size={15} /> Create Server
          </Link>
        }
      />

      <div className="mb-4 relative max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input className="input pl-9" placeholder="Search servers..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {items.length === 0 ? (
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
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-white/5 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Egg</th>
                <th className="px-4 py-3 font-medium">Node</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map((s: any) => (
                <tr key={s.id} className="cursor-pointer hover:bg-white/5">
                  <td className="px-4 py-3">
                    <Link to={`/app/servers/${s.id}`} className="font-medium text-slate-200 hover:text-accent-400">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{s.egg?.name}</td>
                  <td className="px-4 py-3 text-slate-400">{s.node?.name}</td>
                  <td className="px-4 py-3 text-slate-400">{s.owner?.username}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {s.primaryAllocation ? `${s.primaryAllocation.ip}:${s.primaryAllocation.port}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
