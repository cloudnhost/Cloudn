import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { PageHeader, Loading, Modal } from "../../components/ui";

export default function AdminLocations() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", description: "" });
  const { data, isLoading } = useQuery({ queryKey: ["locations"], queryFn: () => api.get<any[]>("/locations") });

  const create = useMutation({
    mutationFn: () => api.post("/locations", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      setOpen(false);
      setForm({ name: "", code: "", description: "" });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/locations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Locations"
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={15} /> Add Location
          </button>
        }
      />
      {isLoading ? (
        <Loading />
      ) : (
        <div className="card divide-y divide-white/5">
          {data?.map((l) => (
            <div key={l.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-200">
                  {l.name} <span className="text-xs text-slate-500">({l.code})</span>
                </div>
                <div className="text-xs text-slate-500">{l.nodeCount} nodes</div>
              </div>
              <button onClick={() => remove.mutate(l.id)} className="text-slate-500 hover:text-red-400">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add Location">
        <div className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Code</label>
            <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          </div>
          <button className="btn-primary w-full" onClick={() => create.mutate()}>
            Create
          </button>
        </div>
      </Modal>
    </div>
  );
}
