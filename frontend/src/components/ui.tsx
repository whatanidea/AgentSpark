import React from "react";

export function Card({ title, icon, children, className = "" }: any) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur p-5 ${className}`}>
      {title && (
        <div className="flex items-center gap-2 mb-3">
          {icon && <span className="text-violet-400">{icon}</span>}
          <h3 className="text-sm font-bold uppercase tracking-wide text-violet-300">{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}

export function Button({ children, onClick, disabled, variant = "primary", className = "" }: any) {
  const styles =
    variant === "primary"
      ? "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white"
      : "bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-40 disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Bar({ pct, color = "#8b5cf6" }: { pct: number; color?: string }) {
  return (
    <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export function Pill({ children, tone = "violet" }: any) {
  const tones: any = {
    violet: "bg-violet-500/15 text-violet-200 border-violet-500/30",
    green: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
    amber: "bg-amber-500/15 text-amber-200 border-amber-500/30",
    red: "bg-rose-500/15 text-rose-200 border-rose-500/30",
    slate: "bg-white/5 text-slate-300 border-white/10",
  };
  return <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${tones[tone]}`}>{children}</span>;
}

export function classColor(cls: string) {
  return { High: "#10b981", Medium: "#f59e0b", Low: "#f97316", "Not Suitable": "#ef4444" }[cls] || "#8b5cf6";
}

export function Spinner({ label = "Working…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-slate-400 text-sm py-6">
      <span className="h-4 w-4 rounded-full border-2 border-violet-500/40 border-t-violet-400 animate-spin" />
      {label}
    </div>
  );
}
