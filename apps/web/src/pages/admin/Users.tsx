import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { PageHeader, StatusBadge, Loading, Modal } from "../../components/ui";

export default function AdminUsers() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ email: "", username: "", password: "", role: "USER", planId: "" });
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", q],
    queryFn: () => api.get<any>(`/users?pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  });

  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: () => api.get<any[]>("/plans?includeHidden=true") });

  const create = useMutation({
    mutationFn: () => api.post("/users", { ...form, planId: form.planId || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setModalOpen(false);
      setForm({ email: "", username: "", password: "", role: "USER", planId: "" });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to create user"),
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Users"
        subtitle={`${data?.total ?? 0} total`}
        actions={
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            <Plus size={15} /> Create User
          </button>
        }
      />

      <div className="mb-4 relative max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input className="input pl-9" placeholder="Search users..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {isLoading ? (
        <Loading />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-white/5 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Servers</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data?.items?.map((u: any) => (
                <tr key={u.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <Link to={`/app/admin/users/${u.id}`} className="font-medium text-slate-200 hover:text-accent-400">
                      {u.username}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{u.email}</td>
                  <td className="px-4 py-3 text-slate-400">{u.role}</td>
                  <td className="px-4 py-3 text-slate-400">{u.plan ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-400">{u.serverCount}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={u.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create User">
        <div className="space-y-3">
          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
          <div>
            <label className="label">Email</label>
            <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Username</label>
            <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="USER">USER</option>
              <option value="STAFF">STAFF</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          <div>
            <label className="label">Plan</label>
            <select className="input" value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
              <option value="">No plan</option>
              {plans?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary w-full" disabled={create.isPending} onClick={() => create.mutate()}>
            Create
          </button>
        </div>
      </Modal>
    </div>
  );
}
