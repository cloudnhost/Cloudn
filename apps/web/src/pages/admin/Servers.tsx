import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Square, RotateCw, Zap, Ban, ShieldCheck, Trash2, Search, SlidersHorizontal } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { PageHeader, StatusBadge, Loading, ErrorState, Modal } from "../../components/ui";

export default function AdminServers() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [resizing, setResizing] = useState<any>(null);
  const [resizeForm, setResizeForm] = useState({ cpuLimit: 0, ramLimitMb: 0, diskLimitMb: 0, swapMb: 0, countsAgainstPlan: true });
  const [resizeError, setResizeError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-servers"],
    queryFn: () => api.get<any>("/servers?pageSize=200"),
    refetchInterval: 6000,
  });

  const action = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => api.post(`/servers/${id}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-servers"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/servers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-servers"] }),
  });

  const resize = useMutation({
    mutationFn: () => api.patch(`/servers/${resizing.id}/resources`, resizeForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-servers"] });
      setResizing(null);
      setResizeError(null);
    },
    onError: (e) => setResizeError(e instanceof ApiError ? e.message : "Failed to resize server"),
  });

  function openResize(s: any) {
    setResizeForm({
      cpuLimit: s.cpuLimit,
      ramLimitMb: s.ramLimitMb,
      diskLimitMb: s.diskLimitMb,
      swapMb: s.swapMb,
      countsAgainstPlan: s.countsAgainstPlan,
    });
    setResizing(s);
  }

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message="Failed to load servers" />;

  const items = (data?.items ?? []).filter((s: any) => s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-8">
      <PageHeader title="Servers" subtitle="Full lifecycle control across every owner" />

      <div className="mb-4 relative max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input className="input pl-9" placeholder="Search servers..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/5 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Node</th>
              <th className="px-4 py-3 font-medium">Resources</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {items.map((s: any) => (
              <tr key={s.id} className="hover:bg-white/5">
                <td className="px-4 py-3">
                  <Link to={`/app/servers/${s.id}`} className="font-medium text-slate-200 hover:text-accent-400">
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-400">{s.owner?.username}</td>
                <td className="px-4 py-3 text-slate-400">{s.node?.name}</td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {s.cpuLimit}% · {s.ramLimitMb}MB · {s.diskLimitMb}MB
                  {!s.countsAgainstPlan && <span className="ml-1.5 badge bg-amber-500/15 text-amber-400">off-plan</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={s.status} />
                    {s.suspended && <StatusBadge status="SUSPENDED" />}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn title="Start" onClick={() => action.mutate({ id: s.id, action: "start" })}>
                      <Play size={13} />
                    </IconBtn>
                    <IconBtn title="Restart" onClick={() => action.mutate({ id: s.id, action: "restart" })}>
                      <RotateCw size={13} />
                    </IconBtn>
                    <IconBtn title="Stop" onClick={() => action.mutate({ id: s.id, action: "stop" })}>
                      <Square size={13} />
                    </IconBtn>
                    <IconBtn title="Kill" danger onClick={() => action.mutate({ id: s.id, action: "kill" })}>
                      <Zap size={13} />
                    </IconBtn>
                    <IconBtn title="Resize" onClick={() => openResize(s)}>
                      <SlidersHorizontal size={13} />
                    </IconBtn>
                    {s.suspended ? (
                      <IconBtn title="Unsuspend" onClick={() => action.mutate({ id: s.id, action: "unsuspend" })}>
                        <ShieldCheck size={13} />
                      </IconBtn>
                    ) : (
                      <IconBtn title="Suspend" onClick={() => action.mutate({ id: s.id, action: "suspend" })}>
                        <Ban size={13} />
                      </IconBtn>
                    )}
                    <IconBtn
                      title="Delete"
                      danger
                      onClick={() => {
                        if (confirm(`Delete server "${s.name}"? This cannot be undone.`)) remove.mutate(s.id);
                      }}
                    >
                      <Trash2 size={13} />
                    </IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!resizing} onClose={() => setResizing(null)} title={`Resize ${resizing?.name ?? ""}`}>
        <div className="space-y-3">
          {resizeError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{resizeError}</div>
          )}
          <div>
            <label className="label">CPU (%)</label>
            <input
              type="number"
              className="input"
              value={resizeForm.cpuLimit}
              onChange={(e) => setResizeForm({ ...resizeForm, cpuLimit: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">RAM (MB)</label>
            <input
              type="number"
              className="input"
              value={resizeForm.ramLimitMb}
              onChange={(e) => setResizeForm({ ...resizeForm, ramLimitMb: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Disk (MB)</label>
            <input
              type="number"
              className="input"
              value={resizeForm.diskLimitMb}
              onChange={(e) => setResizeForm({ ...resizeForm, diskLimitMb: Number(e.target.value) })}
            />
          </div>
          <label className="flex items-start gap-2 rounded-lg bg-white/5 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={resizeForm.countsAgainstPlan}
              onChange={(e) => setResizeForm({ ...resizeForm, countsAgainstPlan: e.target.checked })}
            />
            <span>
              <span className="block text-slate-200">Count against the owner's plan</span>
              <span className="block text-xs text-slate-500">
                Turn off to resize without changing what's deducted from the owner's remaining quota.
              </span>
            </span>
          </label>
          <button className="btn-primary w-full" disabled={resize.isPending} onClick={() => resize.mutate()}>
            Apply Resize
          </button>
        </div>
      </Modal>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition ${
        danger ? "text-red-400 hover:bg-red-500/15" : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
