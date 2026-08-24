import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Clock, KeyRound, Copy } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { Loading, Modal } from "./ui";

// Deliberately not faked. No fake SFTP server, no third-party service —
// the connection itself honestly reports unavailable until the CloudN
// Agent exists. Credentials, however, are real: the Panel is responsible
// for provisioning the SFTP password per CLOUDN_AGENT_INTEGRATION.md §10,
// so generating one here does real, useful work today.
export function SftpPanel({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [revealed, setRevealed] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sftp", serverId],
    queryFn: () => api.get<any>(`/servers/${serverId}/sftp`),
  });

  const rotate = useMutation({
    mutationFn: () => api.post<any>(`/servers/${serverId}/sftp/rotate-credentials`),
    onSuccess: (res) => {
      setRevealed(res);
      qc.invalidateQueries({ queryKey: ["sftp", serverId] });
    },
  });

  if (isLoading) return <Loading />;

  return (
    <div className="card p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
        <Lock size={22} />
      </div>
      <h3 className="text-base font-semibold text-white">SFTP connection is not available yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{data?.reason}</p>

      <div className="mx-auto mt-6 max-w-sm space-y-2 rounded-lg bg-white/5 p-4 text-left text-xs text-slate-500">
        <div className="mb-1 flex items-center gap-1.5 text-slate-400">
          <Clock size={12} /> Connects once the Agent is deployed
        </div>
        <Row label="Host" value={data?.host} />
        <Row label="Port" value={data?.port} />
        <Row label="Username" value={data?.username} />
      </div>

      <button className="btn-secondary mx-auto mt-5" disabled={rotate.isPending} onClick={() => rotate.mutate()}>
        <KeyRound size={14} /> {data?.hasCredentials ? "Regenerate Password" : "Generate Password"}
      </button>
      {data?.hasCredentials && (
        <p className="mt-2 text-xs text-slate-600">
          Credentials provisioned {data.credentialsSetAt ? new Date(data.credentialsSetAt).toLocaleString() : ""}
        </p>
      )}

      <Modal open={!!revealed} onClose={() => setRevealed(null)} title="SFTP Password">
        <p className="mb-3 text-sm text-amber-400">Save this password now — it will not be shown again.</p>
        <div className="space-y-2 text-left text-sm">
          <Row label="Host" value={revealed?.host} />
          <Row label="Port" value={revealed?.port} />
          <Row label="Username" value={revealed?.username} />
          <div className="flex items-center justify-between rounded-lg bg-black/40 px-3 py-2">
            <code className="text-xs text-emerald-400">{revealed?.password}</code>
            <button
              className="text-slate-500 hover:text-slate-300"
              onClick={() => revealed?.password && navigator.clipboard.writeText(revealed.password)}
              title="Copy"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="font-mono text-slate-400">{value ?? "—"}</span>
    </div>
  );
}
