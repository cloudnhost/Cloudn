import { Link, NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { Cloud, Menu, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/features", label: "Features" },
  { to: "/plans", label: "Plans" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

export function PublicLayout() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-base-950">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-base-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 shadow-lg shadow-accent-500/20">
              <Cloud size={17} className="text-white" />
            </div>
            <span className="text-[15px] font-bold tracking-tight text-white">CloudN</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive ? "text-accent-400" : "text-slate-400 hover:text-slate-200"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            {!loading &&
              (user ? (
                <Link to="/app" className="btn-primary">
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/login" className="btn-secondary">
                    Login
                  </Link>
                  <Link to="/register" className="btn-primary">
                    Get Started
                  </Link>
                </>
              ))}
          </div>

          <button className="text-slate-300 md:hidden" onClick={() => setOpen((o) => !o)}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {open && (
          <div className="border-t border-white/5 px-6 py-4 md:hidden">
            <nav className="flex flex-col gap-1">
              {LINKS.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.to === "/"}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/5"
                >
                  {l.label}
                </NavLink>
              ))}
              <div className="mt-2 flex gap-2 border-t border-white/5 pt-3">
                {user ? (
                  <Link to="/app" className="btn-primary flex-1">
                    Dashboard
                  </Link>
                ) : (
                  <>
                    <Link to="/login" className="btn-secondary flex-1">
                      Login
                    </Link>
                    <Link to="/register" className="btn-primary flex-1">
                      Get Started
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      <Outlet />

      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-accent-400 to-accent-600">
                <Cloud size={13} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-slate-300">CloudN</span>
            </div>
            <nav className="flex flex-wrap justify-center gap-4 text-xs text-slate-500">
              {LINKS.map((l) => (
                <Link key={l.to} to={l.to} className="hover:text-slate-300">
                  {l.label}
                </Link>
              ))}
            </nav>
            <p className="text-xs text-slate-600">© {new Date().getFullYear()} CloudN. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
