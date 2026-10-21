import type { Diagnosis } from "../api";
import { Card } from "./ui";

export default function AnalysisEvidence({ diagnosis, scenario }: { diagnosis: Diagnosis | null; scenario?: string }) {
  if (!diagnosis) return null;
  return (
    <Card title="Diagnostic evidence">
      {scenario && <p className="text-amber-300 text-sm mb-3">Demo fixture: {scenario}. These are fictional sample facts, not facts extracted from your messages.</p>}
      <p className="text-sm text-slate-300">
        Supplied essential facts: {Math.round(diagnosis.data_completeness * 100)}%. Completeness is not confidence in accuracy.
      </p>
      {diagnosis.missing_facts.length > 0 && (
        <div className="mt-3 text-sm text-amber-200">
          <p className="font-semibold">Clarification required — score, ROI and blueprint are withheld.</p>
          <ul className="list-disc pl-5 mt-2">{diagnosis.follow_up_questions.map((q) => <li key={q}>{q}</li>)}</ul>
          <p className="mt-2">Answer in Diagnostic, then rerun analysis. Additional missing facts: {diagnosis.missing_facts.join(", ")}.</p>
        </div>
      )}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-violet-300">Inspect supplied, inferred and missing facts</summary>
        <div className="space-y-2 mt-2">
          {Object.entries(diagnosis.evidence).map(([key, fact]) => (
            <div key={key} className="border-b border-white/10 pb-2">
              <b>{key}</b>: {fact.status} · {fact.source}
              {fact.status !== "missing" && <span> · {JSON.stringify(diagnosis.intelligence?.[key])}</span>}
              {fact.quote && <blockquote className="text-slate-400 mt-1 whitespace-pre-wrap">{fact.quote}</blockquote>}
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}
