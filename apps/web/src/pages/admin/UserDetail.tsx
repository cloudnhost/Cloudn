import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ShieldCheck, ShieldOff, Trash2, KeyRound } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { PageHeader, StatusBadge, Loading, Modal } from "../../components/ui";

export default function AdminUserDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: user, isLoading } = useQuery({
    queryKey: ["admin-user", id],
    queryFn: () => api.get<any>(`/users/${id}`),
  });
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: () => api.get<any[]>("/plans?includeHidden=true") });

  const [edit, setEdit] = useState({ role: "", planId: "" });

  function openEdit() {
    setEdit({ role: user.role, planId: user.plan?.id ?? "" });
    setEditOpen(true);
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-user", id] });

  const statusAction = useMutation({
    mutationFn: (action: string) => api.post(`/users/${id}/${action}`),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: () => api.patch(`/users/${id}`, { role: edit.role, planId: edit.planId || null }),
    onSuccess: () => {
      invalidate();
      setEditOpen(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to update user"),
  });

  const resetPassword = useMutation({
    mutationFn: () => api.post(`/users/${id}/reset-password`, { newPassword }),
    onSuccess: () => {
      setResetOpen(false);
      setNewPassword("");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to reset password"),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/users/${id}`),
    onSuccess: () => window.history.back(),
  });

  if (isLoading || !user) return <Loading />;

  return (
    <div className="p-8">
      <PageHeader
        title={user.username}
        subtitle={user.email}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={user.status} />
            <button className="btn-secondary" onClick={openEdit}>
              Edit
            </button>
            <button className="btn-secondary" onClick={() => setResetOpen(true)}>
              <KeyRound size={14} /> Reset Password
            </button>
            {user.status === "SUSPENDED" ? (
              <button className="btn-secondary" onClick={() => statusAction.mutate("unsuspend")}>
                <ShieldCheck size={14} /> Unsuspend
              </button>
            ) : (
              <button className="btn-secondary" onClick={() => statusAction.mutate("suspend")}>
                <ShieldOff size={14} /> Suspend
              </button>
            )}
            {user.status === "BANNED" ? (
              <button className="btn-secondary" onClick={() => statusAction.mutate("unban")}>
                Unban
              </button>
            ) : (
              <button className="btn-danger" onClick={() => statusAction.mutate("ban")}>
                <Ban size={14} /> Ban
              </button>
            )}
            <button
              className="btn-danger"
              onClick={() => {
                if (confirm(`Delete user "${user.username}"? This cannot be undone.`)) remove.mutate();
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card space-y-3 p-5 text-sm">
          <h3 className="mb-1 text-sm font-semibold text-slate-300">Account</h3>
          <Row label="Role" value={user.role} />
          <Row label="Plan" value={user.plan?.name ?? "None"} />
          <Row label="Created" value={new Date(user.createdAt).toLocaleDateString()} />
          <Row label="Last Login" value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"} />
        </div>

        {user.remaining && (
          <div className="card space-y-3 p-5 text-sm">
            <h3 className="mb-1 text-sm font-semibold text-slate-300">Remaining Resources</h3>
            <Row label="RAM" value={`${user.remaining.ramMb} MB`} />
            <Row label="CPU" value={`${user.remaining.cpuPercent}%`} />
            <Row label="Disk" value={`${user.remaining.diskMb} MB`} />
            <Row label="Servers" value={user.remaining.servers} />
          </div>
        )}

        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Servers</h3>
          <div className="space-y-2">
            {user.servers?.length === 0 && <p className="text-sm text-slate-500">No servers</p>}
            {user.servers?.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                <span className="text-slate-200">{s.name}</span>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit User">
        <div className="space-y-3">
          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
          <div>
            <label className="label">Role</label>
            <select className="input" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
              <option value="USER">USER</option>
              <option value="STAFF">STAFF</option>
              <option value="ADMIN">ADMIN</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            </select>
          </div>
          <div>
            <label className="label">Plan</label>
            <select className="input" value={edit.planId} onChange={(e) => setEdit({ ...edit, planId: e.target.value })}>
              <option value="">No plan</option>
              {plans?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary w-full" disabled={update.isPending} onClick={() => update.mutate()}>
            Save Changes
          </button>
        </div>
      </Modal>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset Password">
        <div className="space-y-3">
          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
          <div>
            <label className="label">New Password</label>
            <input
              type="password"
              className="input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
            />
          </div>
          <button className="btn-primary w-full" disabled={resetPassword.isPending} onClick={() => resetPassword.mutate()}>
            Reset Password
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200">{value}</span>
    </div>
  );
}
