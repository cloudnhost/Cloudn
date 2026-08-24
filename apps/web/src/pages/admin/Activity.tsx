import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { PageHeader, Loading } from "../../components/ui";

export default function AdminActivity() {
  const [tab, setTab] = useState<"activity" | "audit">("activity");
  const { data, isLoading } = useQuery({
    queryKey: ["logs", tab],
    queryFn: () => api.get<any>(`/logs/${tab}?pageSize=50`),
  });

  return (
    <div className="p-8">
      <PageHeader title="Activity" subtitle="System-wide activity and audit trail" />

      <div className="mb-6 flex gap-1 border-b border-white/5">
        {(["activity", "audit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-medium capitalize transition ${
              tab === t ? "border-accent-500 text-accent-400" : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t === "activity" ? "Activity Feed" : "Audit Logs"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loading />
      ) : tab === "activity" ? (
        <div className="card divide-y divide-white/5">
          {data?.items?.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-500">No activity recorded yet</div>}
          {data?.items?.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm text-slate-200">{a.message}</div>
                <div className="text-xs text-slate-500">{a.user?.username ?? "system"}</div>
              </div>
              <div className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-white/5 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data?.items?.map((l: any) => (
                <tr key={l.id}>
                  <td className="px-4 py-3">
                    <span className="badge bg-white/5 text-slate-300">{l.action}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{l.actor?.username ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{l.target ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{l.ip ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
