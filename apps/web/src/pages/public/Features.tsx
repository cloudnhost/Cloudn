import { Link } from "react-router-dom";
import {
  Server,
  Shield,
  Gauge,
  Globe2,
  Terminal,
  Layers,
  FolderTree,
  Network,
  Activity,
  Users,
  Lock,
  ArrowRight,
} from "lucide-react";

const GROUPS = [
  {
    title: "For your players and users",
    items: [
      { icon: Terminal, title: "Live console", desc: "Real-time server output and a command line, streamed to your browser." },
      { icon: FolderTree, title: "File manager", desc: "Browse, edit, upload, and download server files without SSH or SFTP tools." },
      { icon: Gauge, title: "Live resource graphs", desc: "CPU, RAM, disk, and network usage updating in real time." },
      { icon: Network, title: "Port & allocation control", desc: "Primary and additional allocations managed per server, per node." },
    ],
  },
  {
    title: "For administrators",
    items: [
      { icon: Users, title: "Full user management", desc: "Create, suspend, ban, and assign plans to users — with every action audited." },
      { icon: Layers, title: "Configurable plans", desc: "Define CPU, RAM, disk, and limits per plan. Nothing is hardcoded." },
      { icon: Server, title: "Multi-node ready", desc: "The architecture never assumes a single node — scale to a hundred without redesigning anything." },
      { icon: Activity, title: "Full audit trail", desc: "Every administrative action is logged with actor, target, and timestamp." },
    ],
  },
  {
    title: "Under the hood",
    items: [
      { icon: Shield, title: "Real authorization", desc: "Every permission check happens on the backend — never just a hidden button." },
      { icon: Lock, title: "Secure by default", desc: "Argon2 password hashing, hashed session tokens, and CSPRNG node credentials." },
      { icon: Globe2, title: "Single-origin architecture", desc: "One public origin serves the whole panel — simple to deploy, simple to secure." },
    ],
  },
];

export default function Features() {
  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-14 text-center">
          <h1 className="text-3xl font-extrabold text-white sm:text-4xl">Built like a real hosting platform</h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-500">
            CloudN isn't a themed admin template — every feature below is backed by real database
            records, real validation, and real permission checks.
          </p>
        </div>

        <div className="space-y-14">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h2 className="mb-5 text-lg font-semibold text-slate-200">{group.title}</h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {group.items.map((f) => (
                  <div key={f.title} className="card flex gap-4 p-5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400">
                      <f.icon size={19} />
                    </div>
                    <div>
                      <h3 className="mb-1 text-sm font-semibold text-slate-200">{f.title}</h3>
                      <p className="text-sm text-slate-500">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Link to="/register" className="btn-primary inline-flex px-6 py-3 text-base">
            Get Started <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
