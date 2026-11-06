import type { ROIAssumptions, ValueEvidence, ValueField } from "../api";

export const DEFAULT_ROI_ASSUMPTIONS: ROIAssumptions = {
  mode: "deferred", working_days_per_year: null, manual_minutes_per_item: null,
  effort_reduction_percent: null, loaded_hourly_rate: null, productive_hours_per_fte: null,
  implementation_cost: null, annual_operating_cost: null, annual_cash_savings: null,
  annual_avoided_hiring_value: null, service_improvements: "", evidence: {}, roles: [],
};

export function savedValueAssumptions(value?: ROIAssumptions): ROIAssumptions {
  if (!value || value.minutes_per_step != null || value.implementation_cost_per_agent != null) {
    return DEFAULT_ROI_ASSUMPTIONS;
  }
  return { ...DEFAULT_ROI_ASSUMPTIONS, ...value };
}

function EvidenceInput({ label, evidence, unknown, onChange, disabled }: {
  label: string; evidence?: ValueEvidence; unknown: boolean; disabled: boolean;
  onChange: (value: ValueEvidence) => void;
}) {
  return <div className="space-y-2">
    <label className="text-xs text-zinc-600 block">Basis for {label}
      <select className="form-control block mt-1" disabled={disabled || unknown}
        value={unknown ? "unknown" : evidence?.basis ?? "assumed"}
        onChange={(event) => {
          const basis = event.target.value;
          if (basis === "assumed" || basis === "measured" || basis === "finance_approved") {
            onChange({ basis, reference: evidence?.reference ?? "" });
          }
        }}>
        <option value="unknown" disabled>Unknown</option>
        <option value="assumed">Assumed</option><option value="measured">Measured</option>
        <option value="finance_approved">Finance-approved</option>
      </select>
    </label>
    <label className="text-xs text-zinc-600 block">Source for {label} (optional)
      <input className="form-control block mt-1" maxLength={500} disabled={disabled}
        value={evidence?.reference ?? ""}
        onChange={(event) => onChange({ basis: evidence?.basis ?? "assumed", reference: event.target.value })} />
    </label>
  </div>;
}

function NumberInput({ label, value, max, min = 0, step = "any", evidence, onChange, onEvidence, disabled }: {
  label: string; value: number | null; max: number; min?: number; step?: string;
  evidence?: ValueEvidence; disabled: boolean; onChange: (value: number | null) => void;
  onEvidence: (value: ValueEvidence) => void;
}) {
  return <div className="space-y-2 rounded border border-zinc-200 p-3 min-w-0">
    <label className="text-xs font-medium text-zinc-700 block">{label}
      <input type="number" className="form-control block mt-2" min={min} max={max} step={step}
        disabled={disabled} value={value ?? ""} placeholder="Unknown"
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.valueAsNumber)} />
    </label>
    <EvidenceInput label={label} evidence={evidence} unknown={value == null} onChange={onEvidence} disabled={disabled} />
  </div>;
}

export function ROIAssumptionForm({ value, onChange, disabled }: {
  value: ROIAssumptions; onChange: (value: ROIAssumptions) => void; disabled: boolean;
}) {
  const field = (key: Exclude<ValueField, "service_improvements">, label: string, max: number, min = 0, step = "any") =>
    <NumberInput key={key} label={label} value={value[key]} min={min} max={max} step={step}
      disabled={disabled} evidence={value.evidence[key]}
      onChange={(number) => onChange({ ...value, [key]: number })}
      onEvidence={(evidence) => onChange({ ...value, evidence: { ...value.evidence, [key]: evidence } })} />;
  return <section className="rounded border border-zinc-200 bg-zinc-50/50 p-5 space-y-3" aria-label="Optional business value">
    <h2 className="text-base font-semibold">Business value — optional, not needed for technical analysis</h2>
    <p className="text-sm text-zinc-600">Not ready? Validate during the pilot. Run technical analysis now without estimating salaries, savings or costs.</p>
    <label className="flex items-start gap-2 text-sm font-medium">
      <input type="checkbox" className="mt-1" checked={value.mode === "estimate"} disabled={disabled}
        onChange={(event) => onChange({ ...value, mode: event.target.checked ? "estimate" : "deferred" })} />
      Estimate business value now (optional)
    </label>
    {value.mode === "deferred" ? <p className="text-sm text-zinc-600">Business value deferred — validate during the pilot. No financial figures will be generated.</p> : <>
      <p className="text-xs text-zinc-500">All fields are optional. Blank means unknown, not zero. Uses the workflow's reported daily volume.
        Measure active human effort, not waiting time. Labels are stakeholder attestations, not independent verification. Currency: USD.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {field("working_days_per_year", "Workflow operating days / year", 366, 1, "1")}
        {field("productive_hours_per_fte", "Productive hours / employee-year (optional)", 8784, 0.01)}
        {!value.roles.length && <>
          {field("manual_minutes_per_item", "Total human minutes / item", 1440)}
          {field("effort_reduction_percent", "Expected human-effort reduction (%)", 100)}
          {field("loaded_hourly_rate", "Loaded labor rate (USD / hour; capacity valuation only)", 10000, 0.01)}
        </>}
      </div>
      <p className="text-xs text-zinc-600">For multiple teams, optionally break effort down by role. Role entries replace workflow-average effort and rate inputs.
        Include remaining review and exceptions in the expected reduction. FTE-years are distributed capacity, not positions to remove.</p>
      {value.roles.map((role, index) => <fieldset className="border rounded p-3 space-y-3 min-w-0" key={index}>
        <legend className="text-sm font-medium">Role {index + 1}</legend>
        <label className="text-xs block">Role {index + 1} name
          <input className="form-control block mt-1" value={role.role} maxLength={100} disabled={disabled}
            onChange={(event) => onChange({ ...value, roles: value.roles.map((item, position) =>
              position === index ? { ...item, role: event.target.value } : item) })} />
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(["manual_minutes_per_item", "effort_reduction_percent", "loaded_hourly_rate"] as const).map((key) =>
            <NumberInput key={key} label={`Role ${index + 1} ${key === "manual_minutes_per_item" ? "human minutes / item"
              : key === "effort_reduction_percent" ? "effort reduction (%)" : "loaded rate (USD / hour)"}`}
              value={role[key]} min={key === "loaded_hourly_rate" ? 0.01 : 0}
              max={key === "manual_minutes_per_item" ? 1440 : key === "effort_reduction_percent" ? 100 : 10000}
              disabled={disabled} evidence={role.evidence[key]}
              onChange={(number) => onChange({ ...value, roles: value.roles.map((item, position) =>
                position === index ? { ...item, [key]: number } : item) })}
              onEvidence={(evidence) => onChange({ ...value, roles: value.roles.map((item, position) =>
                position === index ? { ...item, evidence: { ...item.evidence, [key]: evidence } } : item) })} />)}
        </div>
        <button type="button" className="text-sm underline" disabled={disabled}
          onClick={() => onChange({ ...value, roles: value.roles.filter((_, position) => position !== index) })}>Remove role {index + 1}</button>
      </fieldset>)}
      <button type="button" className="text-sm underline" disabled={disabled || value.roles.length >= 20}
        onClick={() => onChange({ ...value, roles: [...value.roles, { role: `Role ${value.roles.length + 1}`,
          manual_minutes_per_item: null, effort_reduction_percent: null, loaded_hourly_rate: null, evidence: {} }] })}>Add role-level effort</button>
      <details className="border-t pt-3">
        <summary className="cursor-pointer text-sm font-medium">Optional financial inputs — leave unknowns blank</summary>
        <p className="text-xs text-zinc-600 mt-2">Capacity value is not cash savings. Use cash savings only for an expected reduction in spending.
          Avoided hiring is separate and is not added to cash payback. Azure operating costs should include usage, infrastructure, support and ongoing review.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          {field("implementation_cost", "Total implementation cost (USD)", 1000000000)}
          {field("annual_operating_cost", "Annual operating cost (USD)", 1000000000)}
          {field("annual_cash_savings", "Annual cash savings (USD; spending reduction only)", 1000000000)}
          {field("annual_avoided_hiring_value", "Annual avoided-hiring value (USD; separate benefit)", 1000000000)}
        </div>
      </details>
      <label className="text-xs font-medium block">Service improvements and pilot measures (optional)
        <textarea className="form-control block mt-2" maxLength={2000} disabled={disabled} value={value.service_improvements}
          placeholder="For example: measure response time, backlog, quality and SLA improvement during the pilot."
          onChange={(event) => onChange({ ...value, service_improvements: event.target.value })} />
      </label>
      <EvidenceInput label="service improvements" evidence={value.evidence.service_improvements}
        unknown={!value.service_improvements.trim()} disabled={disabled}
        onChange={(evidence) => onChange({ ...value, evidence: { ...value.evidence, service_improvements: evidence } })} />
    </>}
  </section>;
}

export type ROIResult = {
  schema_version?: number; status: "deferred" | "incomplete" | "estimated";
  hours_saved_per_year: number | null; capacity_value_per_year: number | null; fte_capacity: number | null;
  annual_cash_savings: number | null; annual_avoided_hiring_value: number | null; annual_net_cash_benefit: number | null;
  implementation_cost: number | null; payback_months: number | null; first_year_balance: number | null;
  service_improvements: string; missing_inputs: string[]; assumptions: string; estimate_basis: string;
  assumption_inputs: ROIAssumptions;
};
const number = (value: number | null | undefined) => value == null ? "Unknown" : value.toLocaleString();
const money = (value: number | null | undefined) => value == null ? "Unknown" : `$${value.toLocaleString()}`;
const LEGACY = "Historical illustrative estimate — not a validated business case. Rerun analysis; business value is deferred by default.";
function valueRows(roi: ROIResult): [string, string][] {
  return [
    ["Capacity released / year (hours)", number(roi.hours_saved_per_year)],
    ["Capacity equivalent (FTE-years; not positions)", number(roi.fte_capacity)],
    ["Capacity value / year (not cash savings)", money(roi.capacity_value_per_year)],
    ["Cash savings / year (supplied spending reduction)", money(roi.annual_cash_savings)],
    ["Avoided hiring / year (separate benefit)", money(roi.annual_avoided_hiring_value)],
    ["Total implementation cost", money(roi.implementation_cost)],
    ["Annual operating cost", money(roi.assumption_inputs.annual_operating_cost)],
    ["Net cash benefit / year (cash minus operations)", money(roi.annual_net_cash_benefit)],
    ["First-year cash balance (including implementation)", money(roi.first_year_balance)],
    ["Cash payback", roi.payback_months == null ? "Not established" : `${roi.payback_months} months`],
  ];
}
export function roiMarkdown(roi?: ROIResult): string {
  if (!roi) return "Business value not assessed.";
  if (roi.schema_version !== 2) return LEGACY;
  if (roi.status === "deferred") return roi.assumptions;
  return `${roi.estimate_basis}\n\n${roi.assumptions}\n\n` +
    valueRows(roi).map(([label, value]) => `- **${label}:** ${value}`).join("\n") +
    `\n\nService improvements (stakeholder input):\n${roi.service_improvements || "Not specified; validate during the pilot."}` +
    `\n\nMissing capacity inputs: ${roi.missing_inputs.join(", ") || "None"}\n\nInputs and provenance:\n\`\`\`json\n${JSON.stringify(roi.assumption_inputs, null, 2)}\n\`\`\``;
}
export default function ROIReport({ roi }: { roi: ROIResult }) {
  if (roi.schema_version !== 2) return <p className="text-amber-800 text-sm">{LEGACY}</p>;
  if (roi.status === "deferred") return <p className="text-sm text-zinc-600">{roi.assumptions}</p>;
  return <div className="text-xs space-y-3">
    <p className="text-amber-800 leading-relaxed">{roi.estimate_basis}</p>
    {roi.status === "incomplete" && <p>Capacity not yet established. Missing inputs: {roi.missing_inputs.join(", ")}. Technical analysis is unaffected.</p>}
    <dl className="grid grid-cols-1 md:grid-cols-2 gap-3">{valueRows(roi).map(([label, value]) =>
      <div key={label}><dt className="text-zinc-600">{label}</dt><dd className="font-semibold mt-1">{value}</dd></div>)}</dl>
    <p>Service improvements (stakeholder input): {roi.service_improvements || "Not specified; validate during the pilot."}</p>
    <p className="text-zinc-500 leading-relaxed">{roi.assumptions}</p>
    <details><summary className="cursor-pointer font-medium">Inputs and provenance</summary>
      <pre className="whitespace-pre-wrap break-words mt-2">{JSON.stringify(roi.assumption_inputs, null, 2)}</pre>
    </details>
  </div>;
}
