import type { ROIAssumptions } from "../api";

export const DEFAULT_ROI_ASSUMPTIONS: ROIAssumptions = {
  working_days_per_year: 250, loaded_hourly_rate: 45, minutes_per_step: 1.5,
  minutes_per_decision: 2, implementation_cost_per_agent: 12000, annual_operating_cost: null,
};

const FIELDS: { key: keyof ROIAssumptions; label: string; min: number; max: number; step: number }[] = [
  { key: "working_days_per_year", label: "Working days / year", min: 1, max: 366, step: 1 },
  { key: "loaded_hourly_rate", label: "Loaded labor rate (USD / hour)", min: 1, max: 1000, step: 0.01 },
  { key: "minutes_per_step", label: "Manual minutes / step", min: 0, max: 60, step: 0.1 },
  { key: "minutes_per_decision", label: "Additional minutes / decision", min: 0, max: 240, step: 0.1 },
  { key: "implementation_cost_per_agent", label: "Build cost / illustrative unit (USD)", min: 1, max: 1000000, step: 1 },
  { key: "annual_operating_cost", label: "Annual operating cost (USD; blank = unknown)", min: 0, max: 1000000000, step: 1 },
];

export function ROIAssumptionForm({ value, onChange, disabled }: {
  value: ROIAssumptions; onChange: (value: ROIAssumptions) => void; disabled: boolean;
}) {
  return (
    <details className="rounded-xl border border-white/10 p-4">
      <summary className="cursor-pointer text-sm text-violet-300">Estimate assumptions — adjust before running analysis</summary>
      <p className="text-xs text-slate-400 mt-2">Defaults are illustrative, not observed facts or Azure pricing. Currency: USD. Blank operating cost means net savings are unknown.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        {FIELDS.map(({ key, label, min, max, step }) => (
          <label key={key} className="text-xs text-slate-300">
            {label}
            <input type="number" min={min} max={max} step={step} disabled={disabled}
              className="block w-full bg-white/5 border border-white/10 rounded p-2 mt-1"
              value={value[key] ?? ""} required={key !== "annual_operating_cost"}
              onChange={(e) => onChange({ ...value, [key]: key === "annual_operating_cost" && !e.target.value
                ? null : e.target.valueAsNumber })} />
          </label>
        ))}
      </div>
    </details>
  );
}

type Scenario = {
  name: string; cost_saved_per_year: number; annual_net_savings: number | null; hours_saved_per_year: number;
  payback_months: number | null; roi_multiple: number | null;
};
export type ROIResult = Omit<Scenario, "name" | "annual_net_savings"> & {
  implementation_cost: number; assumptions: string; estimate_basis: string; operating_costs_included: boolean;
  assumption_inputs: ROIAssumptions; scenarios: Scenario[];
};

const money = (value: number) => `$${value.toLocaleString()}`;
export function roiMarkdown(roi?: ROIResult): string {
  if (!roi) return "No estimate available.";
  if (!Array.isArray(roi.scenarios)) return "Legacy estimate has no auditable assumptions or scenarios. Rerun analysis.";
  return `${roi.estimate_basis}\n\n${roi.assumptions}\n\nBuild cost: ${money(roi.implementation_cost)}\n\n` +
    "| Scenario | Gross labor savings/year | Net after operations/year | Hours/year | Payback | Annual savings/build |\n" +
    "|---|---:|---:|---:|---|---|\n" +
    roi.scenarios.map((s) => `| ${s.name} | ${money(s.cost_saved_per_year)} | ${s.annual_net_savings == null ? "Unknown" : money(s.annual_net_savings)} | ${s.hours_saved_per_year} | ${s.payback_months == null ? "N/A" : `${s.payback_months} months`} | ${s.roi_multiple == null ? "N/A" : `${s.roi_multiple}x`} |`).join("\n") +
    `\n\nAssumption inputs:\n\`\`\`json\n${JSON.stringify(roi.assumption_inputs, null, 2)}\n\`\`\``;
}

export default function ROIReport({ roi }: { roi: ROIResult }) {
  if (!Array.isArray(roi.scenarios)) return <p className="text-amber-200 text-sm">Legacy estimate has no auditable assumptions or scenarios. Rerun analysis.</p>;
  return (
    <div className="text-xs space-y-3">
      <p className="text-amber-200">{roi.estimate_basis}</p>
      <p>One-time build: {money(roi.implementation_cost)}. Payback / multiple use {roi.operating_costs_included ? "savings after supplied operating costs" : "gross labor savings, before unknown operating costs"}.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr>{["Scenario", "Gross labor / yr", "Net after ops / yr", "Hours / yr", "Payback", "Annual savings / build"].map((s) => <th key={s} className="p-2">{s}</th>)}</tr></thead>
          <tbody>{roi.scenarios.map((s) => (
            <tr key={s.name} className="border-t border-white/10">
              <td className="p-2">{s.name}</td><td className="p-2">{money(s.cost_saved_per_year)}</td>
              <td className="p-2">{s.annual_net_savings == null ? "Unknown" : money(s.annual_net_savings)}</td>
              <td className="p-2">{s.hours_saved_per_year.toLocaleString()}</td>
              <td className="p-2">{s.payback_months == null ? "N/A" : `${s.payback_months} mo`}</td>
              <td className="p-2">{s.roi_multiple == null ? "N/A" : `${s.roi_multiple}x`}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="text-slate-400">{roi.assumptions}</p>
    </div>
  );
}
