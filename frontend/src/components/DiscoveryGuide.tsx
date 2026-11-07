import { type DiscoveryRecord, type DiscoverySection } from "../api";
import { Button, Card } from "./ui";

const sections: [DiscoverySection, string][] = [
  ["overview", "Overview"], ["processes", "Processes"], ["people", "People & inputs"],
  ["alignment", "Alignment"], ["evidence", "Evidence"], ["opportunities", "Opportunities"], ["findings", "Findings"],
];

export function visitDiscoverySection(section: DiscoverySection) {
  const target = document.getElementById(`discovery-${section}`);
  if (target) { target.scrollIntoView({ block: "start" }); target.focus({ preventScroll: true }); }
}

export default function DiscoveryGuide({ record, dirty, busy }: { record: DiscoveryRecord; dirty: boolean; busy: boolean }) {
  const overview = record.overview;
  return <section aria-label="Engagement command centre" className="space-y-4">
    <nav aria-label="Discovery stages" className="flex flex-wrap gap-2 rounded border border-zinc-200 bg-white p-3">
      {sections.map(([id, label], index) => <Button key={id} variant="ghost" disabled={busy}
        onClick={() => visitDiscoverySection(id)}>{index + 1}. {label}</Button>)}
    </nav>
    <div id="discovery-overview" tabIndex={-1} className="scroll-mt-6">
      <Card title="Engagement overview" description="A guide to saved discovery activity, not an AI-readiness score.">
        {dirty && <p role="status" className="notice mb-4">Overview reflects the last saved record. Save your changes to refresh checks and export findings. Section navigation keeps your drafts.</p>}
        {overview && <>
          <p className="text-xs uppercase tracking-widest text-brand-700">Suggested focus</p>
          <h3 className="text-2xl font-light mt-2">{overview.stage}</h3>
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 my-5">
            {[["Activity checks documented", `${overview.documented_checks}/${overview.total_checks}`],
              ["Pending requests", overview.pending_requests], ["Overdue requests (UTC)", overview.overdue_requests],
              ["Saved source statements", overview.source_count]].map(([label, value]) => <div key={label}>
              <dt className="text-xs text-zinc-600">{label}</dt><dd className="text-2xl mt-1">{value}</dd>
            </div>)}
          </dl>
          <div className="border-l-2 border-brand-500 pl-4">
            <h3 className="font-semibold">Recommended next action</h3>
            <p className="mt-2">{overview.next_actions[0].message}</p>
            <Button variant="ghost" disabled={busy} onClick={() => visitDiscoverySection(overview.next_actions[0].section)}>
              Go to {sections.find(([id]) => id === overview.next_actions[0].section)?.[1]}
            </Button>
          </div>
          <details className="mt-4"><summary className="cursor-pointer font-semibold">Activity checks and evidence gaps</summary>
            <ul className="space-y-4 mt-4">{overview.checks.map(check => <li key={check.id}>
              <p className="font-semibold">{check.complete ? "Documented" : "Needs attention"}: {check.label}</p>
              <p className="text-sm mt-1">{check.detail}</p>
              <Button variant="ghost" disabled={busy} onClick={() => visitDiscoverySection(check.section)}>Review {check.label.toLowerCase()}</Button>
            </li>)}</ul>
            {!!overview.unanswered_prompts.length && <><h4 className="font-semibold mt-4">Open playbook questions</h4>
              <ul className="list-disc pl-5 text-sm">{overview.unanswered_prompts.map(prompt => <li key={prompt}>{prompt}</li>)}</ul></>}
          </details>
          <p className="text-xs text-zinc-600 mt-4">{overview.limitations}</p>
        </>}
      </Card>
    </div>
  </section>;
}
