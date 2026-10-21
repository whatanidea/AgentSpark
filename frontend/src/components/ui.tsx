import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({ title, description, icon, children, className = "" }: {
  title?: string; description?: string; icon?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div className={`surface-card ${className}`}>
      {title && (
        <div className="mb-5">
          <div className="flex items-center gap-2">
            {icon && <span className="text-teal-700">{icon}</span>}
            <h2 className="section-title">{title}</h2>
          </div>
          {description && <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Button({ children, variant = "primary", className = "", type = "button", ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = { primary: "action-primary", ghost: "action-secondary", danger: "action-danger" };
  return (
    <button
      {...props}
      type={type}
      className={`action-button ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Bar({ pct, color = "#0d9488" }: { pct: number; color?: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export function Pill({ children, tone = "violet" }: { children: ReactNode; tone?: "violet" | "green" | "amber" | "red" | "slate" }) {
  const tones = {
    violet: "bg-teal-50 text-teal-800 border-teal-200",
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-rose-50 text-rose-800 border-rose-200",
    slate: "bg-slate-50 text-slate-600 border-slate-200",
  };
  return <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${tones[tone]}`}>{children}</span>;
}

export function classColor(cls: string) {
  return { High: "#047857", Medium: "#92400e", Low: "#c2410c", "Not Suitable": "#be123c" }[cls] || "#0f766e";
}

export function Spinner({ label = "Working…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-slate-600 text-sm py-6">
      <span className="h-4 w-4 rounded-full border-2 border-teal-200 border-t-teal-700 animate-spin" />
      {label}
    </div>
  );
}
