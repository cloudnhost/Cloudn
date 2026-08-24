import type { ReactNode } from "react";
import clsx from "clsx";
import { Inbox, AlertTriangle } from "lucide-react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, hint }: { label: string; value: ReactNode; icon?: any; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {Icon && <Icon size={15} className="text-slate-600" />}
      </div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  ONLINE: "bg-emerald-500/15 text-emerald-400",
  RUNNING: "bg-emerald-500/15 text-emerald-400",
  OFFLINE: "bg-slate-500/15 text-slate-400",
  UNKNOWN: "bg-slate-500/15 text-slate-400",
  CREATING: "bg-amber-500/15 text-amber-400",
  INSTALLING: "bg-amber-500/15 text-amber-400",
  STARTING: "bg-amber-500/15 text-amber-400",
  STOPPING: "bg-amber-500/15 text-amber-400",
  ERRORED: "bg-red-500/15 text-red-400",
  SUSPENDED: "bg-amber-500/15 text-amber-400",
  BANNED: "bg-red-500/15 text-red-400",
  MAINTENANCE: "bg-amber-500/15 text-amber-400",
  ACTIVE: "bg-emerald-500/15 text-emerald-400",
  DISABLED: "bg-slate-500/15 text-slate-400",
  AVAILABLE: "bg-emerald-500/15 text-emerald-400",
  ASSIGNED: "bg-accent-500/15 text-accent-400",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-slate-500/15 text-slate-400";
  return (
    <span className={clsx("badge", style)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status.replace("_", " ")}
    </span>
  );
}

export function EmptyState({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/5">
        <Inbox size={20} className="text-slate-500" />
      </div>
      <div className="text-sm font-medium text-slate-300">{title}</div>
      {subtitle && <div className="mt-1 max-w-xs text-sm text-slate-500">{subtitle}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5 py-16 text-center">
      <AlertTriangle size={20} className="mb-3 text-red-400" />
      <div className="text-sm font-medium text-red-400">{message}</div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-accent-500" />
    </div>
  );
}

export function ResourceBar({ label, percent }: { label: string; percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const color = clamped > 85 ? "bg-red-500" : clamped > 60 ? "bg-amber-500" : "bg-accent-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-medium text-slate-300">{clamped.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div className={clsx("h-full rounded-full transition-all", color)} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className={clsx("card max-h-[85vh] w-full overflow-y-auto p-6", wide ? "max-w-2xl" : "max-w-md")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
