import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, EyeOff, Eye, Trash2 } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { PageHeader, Loading, Modal } from "../../components/ui";

const emptyForm = {
  name: "",
  description: "",
  price: 0,
  billingInterval: "MONTHLY",
  cpuPercent: 100,
  ramMb: 1024,
  diskMb: 10000,
  swapMb: 0,
  maxServers: 1,
  maxDatabases: 1,
  maxBackups: 1,
  maxAllocations: 1,
};

const NUMERIC_FIELDS = [
  ["price", "Price ($)"],
  ["cpuPercent", "CPU (%)"],
  ["ramMb", "RAM (MB)"],
  ["diskMb", "Disk (MB)"],
  ["swapMb", "Swap (MB)"],
  ["maxServers", "Max Servers"],
  ["maxDatabases", "Max Databases"],
  ["maxBackups", "Max Backups"],
  ["maxAllocations", "Max Allocations"],
] as const;

export default function AdminPlans() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["plans-admin"],
    queryFn: () => api.get<any[]>("/plans?includeHidden=true"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["plans-admin"] });

  const create = useMutation({
    mutationFn: () => api.post("/plans", form),
    onSuccess: () => {
      invalidate();
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to create plan"),
  });

  const update = useMutation({
    mutationFn: () => api.patch(`/plans/${editingPlan.id}`, form),
    onSuccess: () => {
      invalidate();
      setEditingPlan(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to update plan"),
  });

  const toggleHidden = useMutation({
    mutationFn: ({ id, hide }: { id: string; hide: boolean }) => api.post(`/plans/${id}/${hide ? "hide" : "unhide"}`),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/plans/${id}`),
    onSuccess: invalidate,
  });

  function openEdit(p: any) {
    setForm({
      name: p.name,
      description: p.description ?? "",
      price: Number(p.price),
      billingInterval: p.billingInterval,
      cpuPercent: p.cpuPercent,
      ramMb: p.ramMb,
      diskMb: p.diskMb,
      swapMb: p.swapMb,
      maxServers: p.maxServers,
      maxDatabases: p.maxDatabases,
      maxBackups: p.maxBackups,
      maxAllocations: p.maxAllocations,
    });
    setEditingPlan(p);
  }

  const FormBody = (
    <div className="grid grid-cols-2 gap-3">
      {error && <div className="col-span-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
      <div className="col-span-2">
        <label className="label">Name</label>
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="col-span-2">
        <label className="label">Description</label>
        <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div>
        <label className="label">Billing Interval</label>
        <select className="input" value={form.billingInterval} onChange={(e) => setForm({ ...form, billingInterval: e.target.value })}>
          <option value="MONTHLY">Monthly</option>
          <option value="QUARTERLY">Quarterly</option>
          <option value="YEARLY">Yearly</option>
          <option value="ONE_TIME">One-time</option>
        </select>
      </div>
      <div />
      {NUMERIC_FIELDS.map(([key, label]) => (
        <div key={key}>
          <label className="label">{label}</label>
          <input
            type="number"
            className="input"
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-8">
      <PageHeader
        title="Plans"
        subtitle="Fully configurable — nothing is hardcoded"
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setForm(emptyForm);
              setOpen(true);
            }}
          >
            <Plus size={15} /> Create Plan
          </button>
        }
      />

      {isLoading ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data?.map((p) => (
            <div key={p.id} className={`card p-5 ${!p.isActive ? "opacity-60" : ""}`}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-base font-semibold text-white">{p.name}</span>
                <div className="flex gap-1">
                  <IconBtn title="Edit" onClick={() => openEdit(p)}>
                    <Pencil size={13} />
                  </IconBtn>
                  {p.isActive ? (
                    <IconBtn title="Hide" onClick={() => toggleHidden.mutate({ id: p.id, hide: true })}>
                      <EyeOff size={13} />
                    </IconBtn>
                  ) : (
                    <IconBtn title="Unhide" onClick={() => toggleHidden.mutate({ id: p.id, hide: false })}>
                      <Eye size={13} />
                    </IconBtn>
                  )}
                  <IconBtn
                    title="Delete"
                    danger
                    onClick={() => {
                      if (confirm(`Delete plan "${p.name}"? Users on this plan will keep their servers.`)) remove.mutate(p.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </IconBtn>
                </div>
              </div>
              {!p.isActive && <div className="mb-2 text-[10px] uppercase tracking-wide text-amber-500">Hidden</div>}
              <div className="mb-4 text-2xl font-bold text-accent-400">
                ${Number(p.price).toFixed(2)}
                <span className="text-sm font-normal text-slate-500">/{p.billingInterval.toLowerCase()}</span>
              </div>
              <div className="space-y-1.5 text-sm text-slate-400">
                <div>CPU: {p.cpuPercent}%</div>
                <div>RAM: {p.ramMb} MB</div>
                <div>Disk: {p.diskMb} MB</div>
                <div>Servers: {p.maxServers}</div>
                <div>Databases: {p.maxDatabases}</div>
                <div>Backups: {p.maxBackups}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Create Plan" wide>
        {FormBody}
        <button className="btn-primary mt-4 w-full" disabled={create.isPending} onClick={() => create.mutate()}>
          Create Plan
        </button>
      </Modal>

      <Modal open={!!editingPlan} onClose={() => setEditingPlan(null)} title={`Edit ${editingPlan?.name ?? ""}`} wide>
        {FormBody}
        <button className="btn-primary mt-4 w-full" disabled={update.isPending} onClick={() => update.mutate()}>
          Save Changes
        </button>
      </Modal>
    </div>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
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
