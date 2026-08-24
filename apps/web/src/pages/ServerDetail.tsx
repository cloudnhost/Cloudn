import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Square, RotateCw, Send } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { PageHeader, StatusBadge, Loading, ErrorState, ResourceBar } from "../components/ui";
import { FileManager } from "../components/FileManager";
import { SftpPanel } from "../components/SftpPanel";

const TABS = ["Overview", "Console", "Files", "SFTP", "Startup"] as const;

export default function ServerDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");

  const { data: server, isLoading, error } = useQuery({
    queryKey: ["server", id],
    queryFn: () => api.get<any>(`/servers/${id}`),
    refetchInterval: 5000,
  });

  const { data: resources } = useQuery({
    queryKey: ["server-resources", id],
    queryFn: () => api.get<any>(`/servers/${id}/resources`),
    refetchInterval: 3000,
    enabled: !!server,
  });

  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const lifecycle = useMutation({
    mutationFn: (action: "start" | "stop" | "restart") => api.post(`/servers/${id}/${action}`),
    onSuccess: () => {
      setLifecycleError(null);
      qc.invalidateQueries({ queryKey: ["server", id] });
    },
    onError: (e) => setLifecycleError(e instanceof ApiError ? e.message : "Action failed"),
  });

  if (isLoading) return <Loading />;
  if (error || !server) return <ErrorState message="Server not found" />;

  return (
    <div className="p-8">
      <PageHeader
        title={server.name}
        subtitle={`${server.egg?.name} · ${server.node?.name} · ${server.primaryAllocation ? `${server.primaryAllocation.ip}:${server.primaryAllocation.port}` : "no allocation"}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={server.status} />
            {server.suspended && <StatusBadge status="SUSPENDED" />}
            <button className="btn-secondary" disabled={lifecycle.isPending} onClick={() => lifecycle.mutate("start")}>
              <Play size={14} /> Start
            </button>
            <button className="btn-secondary" disabled={lifecycle.isPending} onClick={() => lifecycle.mutate("restart")}>
              <RotateCw size={14} /> Restart
            </button>
            <button className="btn-danger" disabled={lifecycle.isPending} onClick={() => lifecycle.mutate("stop")}>
              <Square size={14} /> Stop
            </button>
          </div>
        }
      />

      {server.suspended && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          This server has been suspended by an administrator and cannot be started until it's unsuspended.
        </div>
      )}
      {lifecycleError && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          {lifecycleError}
        </div>
      )}

      <div className="mb-6 flex gap-1 border-b border-white/5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t ? "border-accent-500 text-accent-400" : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="card space-y-4 p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold text-slate-300">Resources</h3>
            <ResourceBar label={`CPU (limit ${server.cpuLimit}%)`} percent={resources ? (resources.cpuPercent / server.cpuLimit) * 100 : 0} />
            <ResourceBar label={`RAM (limit ${server.ramLimitMb} MB)`} percent={resources ? (resources.ramMb / server.ramLimitMb) * 100 : 0} />
            <ResourceBar label={`Disk (limit ${server.diskLimitMb} MB)`} percent={resources ? (resources.diskMb / server.diskLimitMb) * 100 : 0} />
            <div className="grid grid-cols-2 gap-4 pt-2 text-sm">
              <div>
                <div className="text-xs text-slate-500">Uptime</div>
                <div className="text-slate-300">{resources ? `${Math.floor(resources.uptimeSeconds / 60)}m` : "—"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Network</div>
                <div className="text-slate-300">
                  {resources ? `↓ ${(resources.networkRxBytes / 1024).toFixed(0)} KB/s ↑ ${(resources.networkTxBytes / 1024).toFixed(0)} KB/s` : "—"}
                </div>
              </div>
            </div>
            {!server.countsAgainstPlan && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                This server does not count against the owner's plan quota.
              </p>
            )}
          </div>

          <div className="card space-y-3 p-5 text-sm">
            <h3 className="mb-1 text-sm font-semibold text-slate-300">Details</h3>
            <Row label="Identifier" value={server.identifier} />
            <Row label="Owner" value={server.owner?.username} />
            <Row label="Docker Image" value={server.dockerImage} mono />
            <Row label="Egg" value={server.egg?.name} />
            <Row label="Node" value={server.node?.name} />
            <Row label="Created" value={new Date(server.createdAt).toLocaleDateString()} />
          </div>

          <div className="card p-5 lg:col-span-3">
            <PortsPanel serverId={id!} server={server} />
          </div>
        </div>
      )}

      {tab === "Console" && <ConsolePanel serverId={id!} />}

      {tab === "Files" && <FileManager serverId={id!} />}

      {tab === "SFTP" && <SftpPanel serverId={id!} />}

      {tab === "Startup" && (
        <div className="card space-y-4 p-5">
          <h3 className="text-sm font-semibold text-slate-300">Startup Command</h3>
          <code className="block rounded-lg bg-black/40 p-3 text-xs text-emerald-400">{server.startupCommand}</code>
          <h3 className="pt-2 text-sm font-semibold text-slate-300">Environment Variables</h3>
          <div className="divide-y divide-white/5 rounded-lg border border-white/5">
            {server.variables?.map((v: any) => (
              <div key={v.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-slate-400">{v.eggVariable.displayName}</span>
                <span className="font-mono text-slate-300">{v.value || <em className="text-slate-600">empty</em>}</span>
              </div>
            ))}
            {(!server.variables || server.variables.length === 0) && (
              <div className="px-3 py-4 text-center text-sm text-slate-500">No variables configured</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={mono ? "font-mono text-xs text-slate-300" : "text-slate-300"}>{value}</span>
    </div>
  );
}

function ConsolePanel({ serverId }: { serverId: string }) {
  const [lines, setLines] = useState<{ timestamp: string; line: string }[]>([]);
  const [command, setCommand] = useState("");
  const sinceRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      if (stopped) return;
      try {
        const res = await api.get<{ lines: any[]; nextSince: number }>(
          `/servers/${serverId}/console?since=${sinceRef.current}`
        );
        if (res.lines.length) {
          setLines((prev) => [...prev, ...res.lines]);
          sinceRef.current = res.nextSince;
        }
      } catch {
        /* ignore transient errors */
      }
      setTimeout(poll, 1500);
    }
    poll();
    return () => {
      stopped = true;
    };
  }, [serverId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  async function sendCommand(e: React.FormEvent) {
    e.preventDefault();
    if (!command.trim()) return;
    await api.post(`/servers/${serverId}/console/command`, { command });
    setCommand("");
  }

  return (
    <div className="card p-0">
      <div className="h-[420px] overflow-y-auto bg-black/40 p-4 font-mono text-xs leading-relaxed">
        {lines.length === 0 && <div className="text-slate-600">Waiting for console output...</div>}
        {lines.map((l, i) => (
          <div key={i} className="text-emerald-400/90">
            <span className="text-slate-600">[{new Date(l.timestamp).toLocaleTimeString()}] </span>
            {l.line}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={sendCommand} className="flex items-center gap-2 border-t border-white/5 p-3">
        <span className="text-accent-400">{">"}</span>
        <input
          className="input flex-1 bg-transparent border-none focus:ring-0"
          placeholder="Type a command..."
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        />
        <button className="btn-secondary" type="submit">
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

function PortsPanel({ serverId, server }: { serverId: string; server: any }) {
  const qc = useQueryClient();
  const [requestError, setRequestError] = useState<string | null>(null);

  const { data: remaining } = useQuery({
    queryKey: ["remaining-for-server-owner", server.ownerId],
    queryFn: () => api.get<any>("/servers/remaining-resources"),
  });

  const requestPort = useMutation({
    mutationFn: () => api.post(`/servers/${serverId}/allocations`),
    onSuccess: () => {
      setRequestError(null);
      qc.invalidateQueries({ queryKey: ["server", serverId] });
    },
    onError: (e) => setRequestError(e instanceof ApiError ? e.message : "Failed to request a port"),
  });

  const releasePort = useMutation({
    mutationFn: (allocationId: string) => api.delete(`/servers/${serverId}/allocations/${allocationId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["server", serverId] }),
  });

  const additional = (server.allocations ?? []).filter((a: any) => a.id !== server.primaryAllocation?.id);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Network &amp; Ports</h3>
        <button className="btn-secondary" disabled={requestPort.isPending} onClick={() => requestPort.mutate()}>
          Request Additional Port
        </button>
      </div>
      {requestError && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{requestError}</div>
      )}
      <div className="divide-y divide-white/5 rounded-lg border border-white/5">
        {server.primaryAllocation && (
          <div className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="font-mono text-slate-300">
              {server.primaryAllocation.ip}:{server.primaryAllocation.port}
            </span>
            <span className="badge bg-accent-500/15 text-accent-400">Primary</span>
          </div>
        )}
        {additional.map((a: any) => (
          <div key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="font-mono text-slate-300">
              {a.ip}:{a.port}
            </span>
            <button className="text-xs text-slate-500 hover:text-red-400" onClick={() => releasePort.mutate(a.id)}>
              Release
            </button>
          </div>
        ))}
      </div>
      {remaining && server.countsAgainstPlan && (
        <p className="mt-2 text-xs text-slate-500">{remaining.allocations} additional port(s) remaining on your plan.</p>
      )}
    </div>
  );
}
