import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Server,
  Users,
  HardDrive,
  MapPin,
  Network,
  Egg as EggIcon,
  Layers,
  Activity,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Cloud,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import clsx from "clsx";

function NavItem({ to, icon: Icon, label, collapsed }: { to: string; icon: any; label: string; collapsed: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === "/app"}
      className={({ isActive }) =>
        clsx(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
          isActive
            ? "bg-accent-500/15 text-accent-400"
            : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
        )
      }
    >
      <Icon size={17} strokeWidth={2} className="shrink-0" />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

function SectionLabel({ children, collapsed }: { children: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 h-px bg-white/5" />;
  return <div className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">{children}</div>;
}

export function AppLayout() {
  const { user, isStaff, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-base-950">
      <aside
        className={clsx(
          "flex flex-col border-r border-white/5 bg-base-900/60 transition-all duration-200",
          collapsed ? "w-[68px]" : "w-64"
        )}
      >
        <div className="flex items-center justify-between px-4 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 shadow-lg shadow-accent-500/20">
              <Cloud size={17} className="text-white" />
            </div>
            {!collapsed && <span className="text-[15px] font-bold tracking-tight text-white">CloudN</span>}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <NavItem to="/app" icon={LayoutDashboard} label="Dashboard" collapsed={collapsed} />

          <SectionLabel collapsed={collapsed}>Servers</SectionLabel>
          <NavItem to="/app/servers" icon={Server} label="My Servers" collapsed={collapsed} />

          {isStaff && (
            <>
              <SectionLabel collapsed={collapsed}>Management</SectionLabel>
              <div className="space-y-0.5">
                <NavItem to="/app/admin/users" icon={Users} label="Users" collapsed={collapsed} />
                <NavItem to="/app/admin/servers" icon={Server} label="Servers" collapsed={collapsed} />
                <NavItem to="/app/admin/nodes" icon={HardDrive} label="Nodes" collapsed={collapsed} />
                <NavItem to="/app/admin/locations" icon={MapPin} label="Locations" collapsed={collapsed} />
                <NavItem to="/app/admin/allocations" icon={Network} label="Allocations" collapsed={collapsed} />
                <NavItem to="/app/admin/eggs" icon={EggIcon} label="Eggs" collapsed={collapsed} />
                <NavItem to="/app/admin/plans" icon={Layers} label="Plans" collapsed={collapsed} />
              </div>

              <SectionLabel collapsed={collapsed}>System</SectionLabel>
              <NavItem to="/app/admin/activity" icon={Activity} label="Activity" collapsed={collapsed} />
            </>
          )}
        </nav>

        <div className="border-t border-white/5 p-3">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="mb-2 flex w-full items-center justify-center rounded-lg py-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          {!collapsed && user && (
            <div className="flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-500/20 text-xs font-bold text-accent-400">
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-200">{user.username}</div>
                <div className="truncate text-[11px] text-slate-500">{user.role.replace("_", " ")}</div>
              </div>
              <button onClick={logout} className="text-slate-500 hover:text-red-400" title="Log out">
                <LogOut size={15} />
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
