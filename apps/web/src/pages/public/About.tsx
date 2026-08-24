import { Server, Users, ShieldCheck, Cpu } from "lucide-react";

const STATS = [
  { icon: Server, label: "Built for multi-node scale from day one" },
  { icon: ShieldCheck, label: "Every permission enforced on the backend" },
  { icon: Cpu, label: "Real resource accounting, not estimates" },
  { icon: Users, label: "Designed for both players and platform admins" },
];

export default function About() {
  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-extrabold text-white sm:text-4xl">About CloudN</h1>
        <p className="mt-5 text-slate-400">
          CloudN is a hosting control panel built for operators who want real infrastructure
          management, not just a themed dashboard. It's inspired by the ideas that made panels like
          Pterodactyl popular — eggs, nodes, allocations, plans — but implemented from scratch as its
          own platform, with its own API, its own egg format, and its own architecture.
        </p>
        <p className="mt-4 text-slate-400">
          The panel is designed as the <strong className="text-slate-200">control plane</strong>:
          it owns every business rule — who can create a server, how many resources they're allowed,
          which nodes and eggs they can use. A future execution layer, the CloudN Agent, will carry
          out what the panel decides on real infrastructure. Until then, an isolated mock provider
          simulates that execution layer so the rest of the platform can be built and used as if it
          already existed.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {STATS.map((s) => (
            <div key={s.label} className="card flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400">
                <s.icon size={17} />
              </div>
              <span className="text-sm text-slate-300">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
