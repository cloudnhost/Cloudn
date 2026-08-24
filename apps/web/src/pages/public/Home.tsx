import { Link } from "react-router-dom";
import { ArrowRight, Server, Shield, Gauge, Globe2, Terminal, Layers } from "lucide-react";

const FEATURES = [
  { icon: Gauge, title: "NVMe-backed performance", desc: "High-frequency nodes and NVMe storage so your game and app servers stay responsive under load." },
  { icon: Shield, title: "Isolated & secure", desc: "Every server runs in its own container with resource limits enforced at the platform level." },
  { icon: Terminal, title: "Real console access", desc: "A full server console, file manager, and startup configuration — no SSH required." },
  { icon: Layers, title: "Any workload, one panel", desc: "Game servers, Node.js and Python apps, or a fully custom Docker image, all from the same eggs system." },
  { icon: Globe2, title: "Global locations", desc: "Deploy close to your players across multiple regions as our node network grows." },
  { icon: Server, title: "Built to scale", desc: "From a single node to a hundred, CloudN's architecture never assumes there's only one." },
];

export default function Home() {
  return (
    <div>
      <section className="relative overflow-hidden px-6 pb-24 pt-20 md:pt-28">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[500px] bg-gradient-to-b from-accent-500/10 to-transparent" />
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Now onboarding new customers
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl">
            Cloud &amp; game hosting,
            <br />
            <span className="bg-gradient-to-r from-accent-400 to-accent-600 bg-clip-text text-transparent">built for control.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            CloudN gives you a professional hosting panel with real resource management, a proper
            eggs system, and a console that just works — for game servers and application hosting alike.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/register" className="btn-primary px-6 py-3 text-base">
              Get Started <ArrowRight size={16} />
            </Link>
            <Link to="/plans" className="btn-secondary px-6 py-3 text-base">
              View Plans
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Everything you need, nothing you don't</h2>
            <p className="mt-2 text-slate-500">A hosting control plane built like a real platform, not a demo.</p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400">
                  <f.icon size={18} />
                </div>
                <h3 className="mb-1 text-sm font-semibold text-slate-200">{f.title}</h3>
                <p className="text-sm text-slate-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="card mx-auto max-w-4xl p-10 text-center">
          <h2 className="text-2xl font-bold text-white">Ready to deploy your first server?</h2>
          <p className="mt-2 text-slate-500">Create an account and be online in minutes.</p>
          <Link to="/register" className="btn-primary mt-6 inline-flex px-6 py-3 text-base">
            Create your account <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
