import { useEffect, useState } from "react";
import { PROCESSING_EVENT, type ProcessingUpdate } from "../api";

type Operation = ProcessingUpdate & { started: number; stages: string[]; active: boolean; done: boolean };

export default function ProcessingStatus() {
  const [operations, setOperations] = useState<Record<string, Operation>>({});
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    function update(event: Event) {
      if (!(event instanceof CustomEvent)) return;
      const data: ProcessingUpdate = event.detail;
      setOperations(current => {
        const previous = current[data.id];
        if (data.phase === "start") {
          return { ...Object.fromEntries(Object.entries(current).filter(([, operation]) => !operation.done)),
            [data.id]: { ...data, started: Date.now(), stages: [], active: false, done: false } };
        }
        if (!previous) return current;
        const stages = data.phase === "stage" && data.stage && data.stage !== previous.stage
          ? [...previous.stages, ...(previous.stage ? [previous.stage] : [])] : previous.stages;
        return { ...current, [data.id]: { ...previous, ...data, stages,
          stage: data.stage || previous.stage, active: data.phase === "activity" ? Boolean(data.active)
            : data.phase === "complete" || data.phase === "error" ? false : previous.active,
          done: data.phase === "complete" || data.phase === "error" } };
      });
    }
    window.addEventListener(PROCESSING_EVENT, update);
    return () => window.removeEventListener(PROCESSING_EVENT, update);
  }, []);
  const items = Object.values(operations);
  const working = items.some(operation => !operation.done);
  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [working]);
  if (!items.length) return null;
  return (
    <section aria-label="Processing activity" aria-live="polite" className={`rounded-xl border border-brand-200 bg-white p-4 mb-6 min-w-0 ${working ? "sticky top-3 z-20 shadow-sm" : ""}`}>
      {items.map(operation => (
        <div key={operation.id} className="space-y-2 break-words">
          <p className="text-sm font-semibold text-zinc-800">{operation.label}
            <span aria-live="off" className="font-normal text-xs text-zinc-500 ml-2">{operation.done ? operation.phase === "error" ? "Failed" : "Complete"
              : `${Math.max(0, Math.floor((now - operation.started) / 1000))}s elapsed`}</span>
          </p>
          {!operation.done && <><progress aria-label={`${operation.label} processing`} className="w-full h-1.5" />
            <p className="text-xs text-zinc-700">{operation.stage}</p></>}
          {operation.active && <p className="text-xs text-brand-700">The selected AI model is processing this stage.</p>}
          {operation.error && <p className="text-xs text-rose-700">{operation.error}</p>}
          {operation.stages.length > 0 && <details className="text-xs text-zinc-600">
            <summary className="cursor-pointer">{operation.done && !operation.error ? "Completed activity" : "Previous stages"}</summary>
            <ol className="list-decimal pl-5 mt-2 space-y-1">
              {[...operation.stages, ...(operation.done && !operation.error && operation.stage ? [operation.stage] : [])]
                .map((stage, index) => <li key={`${index}-${stage}`}>{stage}</li>)}
            </ol>
          </details>}
          {!operation.done && <p className="text-[11px] text-zinc-500">Live stage updates, not private reasoning or a simulated percentage.</p>}
        </div>
      ))}
    </section>
  );
}
