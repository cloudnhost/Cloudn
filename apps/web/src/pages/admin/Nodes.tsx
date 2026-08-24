import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, PowerOff, Power, Wrench, RotateCcw, Trash2 } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { PageHeader, StatusBadge, Loading, Modal, ResourceBar } from "../../components/ui";

const emptyForm = {
  name: "",
  locationId: "",
  hostname: "",
  ipAddress: "",
  port: 8080,
  memoryMb: 16384,
  diskMb: 250000,
  cpuCores: 8,
};

export default function AdminNodes() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<any>(null);
  const [credModal, setCredModal] = useState<any>(null);
  const [maintenanceNode, setMaintenanceNode] = useState<any>(null);
  const [maintenanceReason, setMaintenanceReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: () => api.get<any[]>("/locations") });
  const { data: nodes, isLoading } = useQuery({
    queryKey: ["admin-nodes"],
    queryFn: () => api.get<any[]>("/nodes"),
    refetchInterval: 6000,
  });

  const [form, setForm] = useState(emptyForm);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-nodes"] });

  const create = useMutation({
    mutationFn: () => api.post<any>("/nodes", form),
    onSuccess: (res) => {
      invalidate();
      setModalOpen(false);
      setForm(emptyForm);
      setCredModal(res.credentials);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to create node"),
  });

  const update = useMutation({
    mutationFn: () => api.patch(`/nodes/${editingNode.id}`, form),
    onSuccess: () => {
      invalidate();
      setEditingNode(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to update node"),
  });

  const toggleEnabled = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) => api.post(`/nodes/${id}/${enable ? "enable" : "disable"}`),
    onSuccess: invalidate,
  });

  const setMaintenance = useMutation({
    mutationFn: () => api.post(`/nodes/${maintenanceNode.id}/maintenance`, { reason: maintenanceReason || undefined }),
    onSuccess: () => {
      invalidate();
      setMaintenanceNode(null);
      setMaintenanceReason("");
    },
  });

  const clearMaintenance = useMutation({
    mutationFn: (id: string) => api.post(`/nodes/${id}/maintenance/clear`),
    onSuccess: invalidate,
  });

  const regenerateSecret = useMutation({
    mutationFn: (id: string) => api.post<any>(`/nodes/${id}/regenerate-secret`),
    onSuccess: (res) => setCredModal({ config: { CLOUDN_NODE_ID: res.nodeId, CLOUDN_NODE_SECRET: res.nodeSecret } }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/nodes/${id}`),
    onSuccess: invalidate,
  });

  function openEdit(n: any) {
    setForm({
      name: n.name,
      locationId: n.locationId ?? "",
      hostname: n.hostname,
      ipAddress: n.ipAddress,
      port: n.port,
      memoryMb: n.memoryMb,
      diskMb: n.diskMb,
      cpuCores: n.cpuCores,
    });
    setEditingNode(n);
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Nodes"
        subtitle="Future CloudN Agent installations"
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setForm(emptyForm);
              setModalOpen(true);
            }}
          >
            <Plus size={15} /> Create Node
          </button>
        }
      />

      {isLoading ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {nodes?.map((n) => (
            <div key={n.id} className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-medium text-slate-200">{n.name}</span>
                <StatusBadge status={n.status} />
              </div>
              <div className="mb-3 text-xs text-slate-500">
                {n.location} · {n.hostname} · {n.serverCount} servers
              </div>
              {n.status === "MAINTENANCE" && n.maintenanceReason && (
                <div className="mb-3 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-400">{n.maintenanceReason}</div>
              )}
              <div className="space-y-2">
                <ResourceBar label="CPU" percent={n.cpuUsage} />
                <ResourceBar label="Memory" percent={n.memoryUsage} />
                <ResourceBar label="Disk" percent={n.diskUsage} />
              </div>
              {n.isDemo && <div className="mt-3 text-[10px] uppercase tracking-wide text-amber-500">Demo / Mock Provider</div>}

              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/5 pt-3">
                <IconBtn title="Edit" onClick={() => openEdit(n)}>
                  <Pencil size={13} />
                </IconBtn>
                {n.isEnabled ? (
                  <IconBtn title="Disable" onClick={() => toggleEnabled.mutate({ id: n.id, enable: false })}>
                    <PowerOff size={13} />
                  </IconBtn>
                ) : (
                  <IconBtn title="Enable" onClick={() => toggleEnabled.mutate({ id: n.id, enable: true })}>
                    <Power size={13} />
                  </IconBtn>
                )}
                {n.status === "MAINTENANCE" ? (
                  <IconBtn title="Clear Maintenance" onClick={() => clearMaintenance.mutate(n.id)}>
                    <RotateCcw size={13} />
                  </IconBtn>
                ) : (
                  <IconBtn title="Maintenance Mode" onClick={() => setMaintenanceNode(n)}>
                    <Wrench size={13} />
                  </IconBtn>
                )}
                <IconBtn title="Regenerate Credentials" onClick={() => regenerateSecret.mutate(n.id)}>
                  <RotateCcw size={13} />
                </IconBtn>
                <IconBtn
                  title="Delete"
                  danger
                  onClick={() => {
                    if (confirm(`Delete node "${n.name}"?`)) remove.mutate(n.id);
                  }}
                >
                  <Trash2 size={13} />
                </IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      <NodeFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create Node"
        form={form}
        setForm={setForm}
        locations={locations}
        error={error}
        onSubmit={() => create.mutate()}
        submitting={create.isPending}
        submitLabel="Create Node"
      />

      <NodeFormModal
        open={!!editingNode}
        onClose={() => setEditingNode(null)}
        title={`Edit ${editingNode?.name ?? ""}`}
        form={form}
        setForm={setForm}
        locations={locations}
        error={error}
        onSubmit={() => update.mutate()}
        submitting={update.isPending}
        submitLabel="Save Changes"
      />

      <Modal open={!!credModal} onClose={() => setCredModal(null)} title="Node Credentials" wide>
        <p className="mb-3 text-sm text-amber-400">Save this secret now — it will not be shown again.</p>
        <pre className="overflow-x-auto rounded-lg bg-black/40 p-4 text-xs text-emerald-400">
{credModal && JSON.stringify(credModal.config, null, 2)}
        </pre>
      </Modal>

      <Modal open={!!maintenanceNode} onClose={() => setMaintenanceNode(null)} title="Enable Maintenance Mode">
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            While under maintenance, <strong className="text-slate-200">{maintenanceNode?.name}</strong> will not accept new
            servers.
          </p>
          <div>
            <label className="label">Reason (optional)</label>
            <input className="input" value={maintenanceReason} onChange={(e) => setMaintenanceReason(e.target.value)} placeholder="Hardware upgrade" />
          </div>
          <button className="btn-primary w-full" disabled={setMaintenance.isPending} onClick={() => setMaintenance.mutate()}>
            Enable Maintenance Mode
          </button>
        </div>
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

function NodeFormModal({
  open,
  onClose,
  title,
  form,
  setForm,
  locations,
  error,
  onSubmit,
  submitting,
  submitLabel,
}: any) {
  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <div className="grid grid-cols-2 gap-3">
        {error && <div className="col-span-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
        <div className="col-span-2">
          <label className="label">Name</label>
          <input className="input" value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="Datalix-01" />
        </div>
        <div>
          <label className="label">Location</label>
          <select className="input" value={form.locationId} onChange={(e: any) => setForm({ ...form, locationId: e.target.value })}>
            <option value="">Select...</option>
            {locations?.map((l: any) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Hostname</label>
          <input className="input" value={form.hostname} onChange={(e: any) => setForm({ ...form, hostname: e.target.value })} placeholder="node01.example.com" />
        </div>
        <div>
          <label className="label">IP Address</label>
          <input className="input" value={form.ipAddress} onChange={(e: any) => setForm({ ...form, ipAddress: e.target.value })} placeholder="1.2.3.4" />
        </div>
        <div>
          <label className="label">Agent Port</label>
          <input type="number" className="input" value={form.port} onChange={(e: any) => setForm({ ...form, port: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">Memory (MB)</label>
          <input type="number" className="input" value={form.memoryMb} onChange={(e: any) => setForm({ ...form, memoryMb: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">Disk (MB)</label>
          <input type="number" className="input" value={form.diskMb} onChange={(e: any) => setForm({ ...form, diskMb: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">CPU Cores</label>
          <input type="number" className="input" value={form.cpuCores} onChange={(e: any) => setForm({ ...form, cpuCores: Number(e.target.value) })} />
        </div>
        <button className="btn-primary col-span-2 mt-2" disabled={submitting} onClick={onSubmit}>
          {submitLabel}
        </button>
      </div>
    </Modal>
  );
}
