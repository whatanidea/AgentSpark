import type { AlignmentSnapshot } from "../api";

export const alignmentFunctions = {
  business: "Business", it: "IT", risk: "Risk", compliance_privacy: "Compliance / Privacy", operations: "Operations",
};
export const alignmentOwnerRoles = {
  executive_sponsor: "Executive sponsor", business_owner: "Business owner", operational_owner: "Operational owner",
};
export const alignmentPositions = {
  support: "Support", conditional: "Support with conditions", more_evidence: "Need more evidence", object: "Object",
};

export function alignmentMarkdown(snapshot: AlignmentSnapshot) {
  const text = (value: string) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const stakeholders = snapshot.record.stakeholders.map(item => {
    const last = item.positions[item.positions.length - 1];
    const status = snapshot.current_positions.includes(item.id) && last ? alignmentPositions[last.position] : "No current position";
    return `| ${alignmentFunctions[item.function]} | ${text(item.label || item.identity_id)} | ${status} | ${text(last?.conditions || "")} |`;
  }).join("\n");
  const owners = snapshot.record.owners.filter(item => !item.withdrawn).map(item =>
    `| ${alignmentOwnerRoles[item.role]} | ${text(item.label || item.identity_id)} | ${snapshot.accepted_owners.includes(item.id) ? "Accepted" : "Not accepted for current scope"} |`).join("\n");
  const decisions = snapshot.record.decisions.map(item => {
    const last = item.outcomes[item.outcomes.length - 1];
    const current = snapshot.current_decisions.includes(item.id);
    return `| ${text(item.question)} | ${text(item.label || item.identity_id)} | ${snapshot.superseded_decisions.includes(item.id) ? "Superseded" : current ? "Owner decision recorded" : "Open"} | ${text(current && last ? last.outcome : "No current outcome")} | ${text(current && last ? last.next_action : item.next_action)} |`;
  }).join("\n");
  return `## Frozen stakeholder alignment\n\nShared outcome: ${text(snapshot.charter.objective)}\n\nProposed measures: ${text(snapshot.charter.success_measures || "Unknown")}\n\nMissing current perspectives: ${snapshot.missing_functions.map(item => alignmentFunctions[item]).join(", ") || "None; recorded positions are not consensus"}\n\n| Function | Person | Position | Conditions |\n|---|---|---|---|\n${stakeholders}\n\n| Responsibility | Person | Acceptance |\n|---|---|---|\n${owners}\n\n| Decision | Owner | Status | Outcome | Next action |\n|---|---|---|---|---|\n${decisions}\n\n${snapshot.limitations}\n\nFull attributed snapshot and history are retained in Discovery origin below.\n\n`;
}

export default function AlignmentBrief({ snapshot }: { snapshot: AlignmentSnapshot }) {
  const data = snapshot.record;
  return <section aria-label="Alignment brief" className="space-y-5 break-words min-w-0">
    <ol aria-label="Alignment decision flow" className="grid gap-2 sm:grid-cols-5">
      {["Shared outcome", "Stakeholder positions", "Open decisions", "Accepted owners", "Next actions"].map((label, index) =>
        <li key={label} className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
          <span className="block text-xs text-brand-700">{index + 1}</span><strong>{label}</strong>
          {index < 4 && <span className="sr-only"> leads to </span>}
        </li>)}
    </ol>
    <div className="border-l-4 border-brand-500 pl-4">
      <h3 className="font-semibold">Shared business outcome</h3><p>{snapshot.charter.objective}</p>
      <p className="text-sm mt-2">Scope: {snapshot.charter.business_units}. {snapshot.charter.required_topics || "Detailed scope not supplied."}</p>
      <p className="text-sm">Exclusions: {snapshot.charter.excluded_topics || "Not supplied."}</p>
      <p className="text-sm">Proposed success measures: {snapshot.charter.success_measures || "Unknown / not supplied."}</p>
      <p className="text-xs text-zinc-600 mt-2">Recorded sponsor: {snapshot.charter.sponsor}; engagement lead: {snapshot.charter.engagement_owner}.
        These labels do not establish accepted ownership.</p>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {Object.entries(alignmentFunctions).map(([functionId, label]) => <article key={functionId} className="rounded border p-3">
        <h3 className="font-semibold">{label}</h3>
        {snapshot.missing_functions.some(item => item === functionId) &&
          <p className="text-amber-800 text-sm">No current position recorded</p>}
        {data.stakeholders.filter(item => item.function === functionId).map(item => {
          const position = item.positions[item.positions.length - 1];
          return <div key={item.id} className="mt-2 text-sm">
            <p className="font-medium">{item.label || item.identity_id}</p>
            <p>{snapshot.inactive_assignments.includes(item.id) ? "Inactive nomination" : !position ? "Awaiting response" :
              snapshot.current_positions.includes(item.id) ? alignmentPositions[position.position] : "Stale position - review required"}</p>
            {position && <><p>{alignmentPositions[position.position]}: {position.rationale}</p>
              {position.conditions && <p className="text-amber-800">Conditions: {position.conditions}</p>}
              <p className="text-xs text-zinc-600">Recorded {new Date(position.recorded_at).toLocaleString()}.
                Sources: {position.source_ids.join(", ") || "None cited"}.</p></>}
            <details className="text-xs mt-1"><summary>Identity and position history</summary>
              <p>{item.identity_id}; label supplied by nominator.</p>
              {item.positions.slice(0, -1).map((previous, index) => <p key={index}>
                {previous.recorded_at}: {alignmentPositions[previous.position]} - {previous.rationale} {previous.conditions}
              </p>)}
            </details>
          </div>;
        })}
      </article>)}
    </div>
    <div><h3 className="font-semibold">Accountable ownership</h3>
      <ul className="mt-2 space-y-2">{Object.entries(alignmentOwnerRoles).map(([role, label]) => {
        const owner = data.owners.filter(item => item.role === role && !item.withdrawn).slice(-1)[0];
        return <li key={role} className="rounded border p-3 text-sm"><strong>{label}: </strong>
          {owner ? `${owner.label || owner.identity_id} - ${snapshot.accepted_owners.includes(owner.id) ? "Accepted for current scope" :
            snapshot.inactive_assignments.includes(owner.id) ? "Inactive nomination" : "Not accepted for current scope"}` : "Not nominated"}</li>;
      })}</ul>
    </div>
    <div><h3 className="font-semibold">Decisions and next actions</h3>
      {!data.decisions.length && <p className="text-sm">No decisions recorded. This does not establish that no blockers exist.</p>}
      <ul className="space-y-3 mt-2">{data.decisions.map(item => {
        const outcome = item.outcomes[item.outcomes.length - 1];
        return <li key={item.id} className="rounded border p-3 text-sm">
          <h4 className="font-semibold">{item.question}</h4>
          <p>{snapshot.superseded_decisions.includes(item.id) ? "Superseded - history retained" :
            snapshot.current_decisions.includes(item.id) ? "Owner decision recorded" : "Open decision"}</p>
          <p>Decision owner: {item.label || item.identity_id} - {snapshot.accepted_decisions.includes(item.id) ?
            "Responsibility accepted" : "Responsibility not accepted for current scope"}</p>
          <p>Authority basis (recorded claim): {item.authority_basis}</p>
          {outcome && <><p className="mt-2">{snapshot.current_decisions.includes(item.id) ? "Recorded outcome" : "Historical / stale outcome"}: {outcome.outcome}</p>
            <p>Rationale: {outcome.rationale}</p></>}
          <p className="mt-2">Next action: {snapshot.current_decisions.includes(item.id) && outcome ? outcome.next_action : item.next_action}</p>
          <p>Due: {item.due_on || "Not agreed"}. Sources: {item.source_ids.join(", ") || "None cited"}.</p>
          <details className="mt-2 text-xs"><summary>Decision identity and history</summary><p>{item.identity_id}</p>
            {item.outcomes.map((previous, index) => <p key={index}>
              {previous.recorded_at}: {previous.outcome} - {previous.rationale}. Next: {previous.next_action}
            </p>)}
          </details>
        </li>;
      })}</ul>
    </div>
    <p className="notice text-xs">{snapshot.limitations}</p>
  </section>;
}
