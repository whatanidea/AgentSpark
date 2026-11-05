import type { Diagnosis } from "../api";
import { Card } from "./ui";

export default function AnalysisEvidence({ diagnosis, scenario }: { diagnosis: Diagnosis | null; scenario?: string }) {
  if (!diagnosis) return null;
  return (
    <Card title="Diagnostic evidence">
      {scenario && <p className="notice notice-warning mb-4">Demo fixture: {scenario}. These are fictional sample facts, not facts extracted from your messages.</p>}
      <p className="text-sm text-zinc-600">
        Supplied essential facts: {Math.round(diagnosis.data_completeness * 100)}%. Completeness is not confidence in accuracy.
      </p>
      {Object.values(diagnosis.evidence).some(fact => fact.source === "document") && <p className="notice mt-3">
        Document statements were reviewed by a human, not independently verified. Context approval is not evidence confirmation or implementation readiness.
      </p>}
      {diagnosis.missing_facts.length > 0 && (
        <div className="mt-4 text-sm text-amber-800 rounded bg-amber-50 border border-amber-200 p-4 leading-relaxed">
          <p className="font-semibold">Clarification required — score, ROI and blueprint are withheld.</p>
          <ul className="list-disc pl-5 mt-2">{diagnosis.follow_up_questions.map((q) => <li key={q}>{q}</li>)}</ul>
          <p className="mt-2">Answer in Diagnostic, then rerun analysis. Additional missing facts: {diagnosis.missing_facts.join(", ")}.</p>
        </div>
      )}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-brand-700 font-medium">Inspect supplied, inferred and missing facts</summary>
        <div className="space-y-2 mt-2">
          {Object.entries(diagnosis.evidence).map(([key, fact]) => (
            <div key={key} className="border-b border-zinc-200 pb-3 break-words">
              <b>{key}</b>: {fact.status} · {fact.source}
              {fact.reference && <p className="text-zinc-500 mt-1">{fact.reference} (human-reviewed, unverified)</p>}
              {fact.status !== "missing" && <span> · {JSON.stringify(diagnosis.intelligence?.[key])}</span>}
              {fact.quote && <blockquote className="text-zinc-600 mt-2 whitespace-pre-wrap border-l-2 border-brand-200 pl-3">{fact.quote}</blockquote>}
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}
