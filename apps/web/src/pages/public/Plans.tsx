import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { api } from "../../lib/api";
import { Loading, EmptyState } from "../../components/ui";

export default function Plans() {
  const { data: plans, isLoading } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => api.get<any[]>("/plans/public"),
  });

  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-extrabold text-white sm:text-4xl">Simple, transparent pricing</h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-500">
            Every plan includes full console access, a file manager, and real resource isolation.
            Prices and limits below are pulled live from CloudN.
          </p>
        </div>

        {isLoading ? (
          <Loading />
        ) : !plans || plans.length === 0 ? (
          <EmptyState title="No plans published yet" subtitle="Check back soon." />
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((p, i) => (
              <div
                key={p.id}
                className={`card relative flex flex-col p-6 ${i === 1 ? "border-accent-500/50 shadow-lg shadow-accent-500/10" : ""}`}
              >
                {i === 1 && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-500 px-3 py-0.5 text-xs font-semibold text-white">
                    Most Popular
                  </span>
                )}
                <h3 className="text-lg font-bold text-white">{p.name}</h3>
                {p.description && <p className="mt-1 text-sm text-slate-500">{p.description}</p>}
                <div className="mt-4 text-3xl font-extrabold text-accent-400">
                  ${Number(p.price).toFixed(2)}
                  <span className="text-sm font-normal text-slate-500">/{p.billingInterval.toLowerCase()}</span>
                </div>

                <ul className="mt-6 flex-1 space-y-2.5 text-sm text-slate-400">
                  <PlanRow value={`${p.cpuPercent}% CPU`} />
                  <PlanRow value={`${(p.ramMb / 1024).toFixed(1)} GB RAM`} />
                  <PlanRow value={`${(p.diskMb / 1024).toFixed(0)} GB Disk`} />
                  <PlanRow value={`${p.maxServers} server${p.maxServers === 1 ? "" : "s"}`} />
                  <PlanRow value={`${p.maxDatabases} database${p.maxDatabases === 1 ? "" : "s"}`} />
                  <PlanRow value={`${p.maxBackups} backup${p.maxBackups === 1 ? "" : "s"}`} />
                  <PlanRow value={`${p.maxAllocations} port allocation${p.maxAllocations === 1 ? "" : "s"}`} />
                </ul>

                <Link to="/register" className="btn-primary mt-6 w-full">
                  Get Started
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlanRow({ value }: { value: string }) {
  return (
    <li className="flex items-center gap-2">
      <Check size={14} className="text-accent-400" />
      {value}
    </li>
  );
}
