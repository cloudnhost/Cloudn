import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "../../lib/api";
import { PageHeader, StatusBadge, Loading, Modal } from "../../components/ui";

export default function AdminAllocations() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nodeId, setNodeId] = useState("");
  const { data: nodes } = useQuery({ queryKey: ["admin-nodes"], queryFn: () => api.get<any[]>("/nodes") });
  const { data, isLoading } = useQuery({
    queryKey: ["admin-allocations", nodeId],
    queryFn: () => api.get<any>(`/allocations?pageSize=100${nodeId ? `&nodeId=${nodeId}` : ""}`),
  });

  const [bulk, setBulk] = useState({ nodeId: "", ip: "", portRangeStart: 25565, portRangeEnd: 25600 });

  const create = useMutation({
    mutationFn: () => api.post("/allocations/bulk", bulk),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-allocations"] });
      setOpen(false);
    },
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Allocations"
        subtitle={`${data?.total ?? 0} total`}
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={15} /> Bulk Create
          </button>
        }
      />

      <div className="mb-4">
        <select className="input max-w-xs" value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
          <option value="">All nodes</option>
          {nodes?.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <Loading />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-white/5 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Port</th>
                <th className="px-4 py-3 font-medium">Node</th>
                <th className="px-4 py-3 font-medium">Server</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data?.items?.map((a: any) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{a.ip}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{a.port}</td>
                  <td className="px-4 py-3 text-slate-400">{a.node?.name}</td>
                  <td className="px-4 py-3 text-slate-400">{a.server?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Bulk Create Allocations">
        <div className="space-y-3">
          <div>
            <label className="label">Node</label>
            <select className="input" value={bulk.nodeId} onChange={(e) => setBulk({ ...bulk, nodeId: e.target.value })}>
              <option value="">Select...</option>
              {nodes?.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">IP Address</label>
            <input className="input" value={bulk.ip} onChange={(e) => setBulk({ ...bulk, ip: e.target.value })} placeholder="1.2.3.4" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Port Range Start</label>
              <input
                type="number"
                className="input"
                value={bulk.portRangeStart}
                onChange={(e) => setBulk({ ...bulk, portRangeStart: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Port Range End</label>
              <input
                type="number"
                className="input"
                value={bulk.portRangeEnd}
                onChange={(e) => setBulk({ ...bulk, portRangeEnd: Number(e.target.value) })}
              />
            </div>
          </div>
          <button className="btn-primary w-full" disabled={create.isPending} onClick={() => create.mutate()}>
            Create Ports
          </button>
        </div>
      </Modal>
    </div>
  );
}
