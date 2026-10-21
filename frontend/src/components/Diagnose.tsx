import { useState } from "react";
import { api, type DemoScenario } from "../api";
import { Card, Button } from "./ui";

type Msg = { role: "user" | "assistant"; content: string; blocked?: boolean };

const SUGGESTION =
  "We process 500 invoices/day across Finance and Legal. There are 6–8 decision points, we use SAP, Email and DocuSign, ~25 exceptions/week need manual review, and compliance sensitivity is high.";

function greeting(c: any): string {
  const where = c?.business_domain ? ` in ${c.business_domain}` : "";
  const sys = c?.existing_systems ? ` running ${c.existing_systems}` : "";
  const comp = c?.compliance_requirements && c.compliance_requirements !== "Low"
    ? ` I'll keep your ${c.compliance_requirements} compliance requirements in mind.` : "";
  return `Thanks for the intake — I can see you're${where}${sys}.${comp} ` +
    `Let's pinpoint one workflow to evaluate: what is it, roughly how many times does it run per day, ` +
    `and how many human decision points are involved?`;
}

export default function Diagnose({ sessionId, context, initialHistory = [], demoMode, onRefresh, onBusyChange, goNext }: any) {
  const [history, setHistory] = useState<Msg[]>(initialHistory.length ? initialHistory
    : context ? [{ role: "assistant", content: greeting(context) }] : []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyzable, setAnalyzable] = useState(initialHistory.some((m: Msg) => m.role === "user"));

  async function send(message?: string, scenario?: DemoScenario) {
    const m = (message ?? text).trim();
    if (!m || busy || !sessionId) return;
    setText("");
    setBusy(true); onBusyChange(true);
    try {
      const res = await api.chat(sessionId, m, scenario);
      const blocked = res.status === "blocked";
      setHistory((h) => [...h, ...(blocked ? [] : [{ role: "user" as const, content: res.message }]),
        { role: "assistant", content: res.response, blocked }]);
      // Only a genuine (non-blocked) exchange makes the workflow analyzable.
      if (!blocked) { setAnalyzable(true); await onRefresh(); }
    } catch (e: any) {
      setHistory((h) => [...h, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setBusy(false); onBusyChange(false);
    }
  }

  async function useSample() {
    await send(SUGGESTION, demoMode ? "invoice" : undefined);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold">Diagnostic Interview</h1>
        <p className="text-slate-400 mt-1">
          Describe the workflow. Every message is screened by the security guardrail before it reaches the AI.
        </p>
      </header>

      {context ? (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm">
          <span className="font-semibold text-violet-200">Context from Intake:</span>{" "}
          <span className="text-slate-300">
            {[context.business_domain, context.team_size, context.existing_systems]
              .filter(Boolean).join(" · ")}
            {context.compliance_requirements ? ` · Compliance: ${context.compliance_requirements}` : ""}
          </span>
        </div>
      ) : !sessionId ? (
        <Card>
          <p className="text-slate-400 text-sm">
            💡 Tip: completing <b>Enterprise Intake</b> first gives the agent richer context — but you can
            start chatting here directly and a session will be created automatically.
          </p>
        </Card>
      ) : null}

      <Card>
        <div role="log" aria-live="polite" aria-label="Diagnostic conversation" className="space-y-3 max-h-[46vh] overflow-y-auto pr-1">
          {!history.some((m) => m.role === "user") && (
            <div className="text-slate-500 text-sm">
              {history.length === 0 ? "No messages yet. " : ""}
              <button className="text-violet-300 underline hover:text-violet-200" onClick={useSample} disabled={busy}>
                Use invoice sample (selects fictional fixture in demo) →
              </button>
            </div>
          )}
          {history.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user" ? "bg-violet-600/30 border border-violet-500/30"
                : m.blocked ? "bg-rose-500/15 border border-rose-500/40 text-rose-200"
                : "bg-white/5 border border-white/10"
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {busy && <div className="text-slate-500 text-sm">…thinking</div>}
        </div>

        <div className="flex gap-2 mt-4">
          <input
            aria-label="Describe your workflow"
            maxLength={8000}
            className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-violet-500/60"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Describe your workflow…"
            disabled={busy}
          />
          <Button onClick={() => send()} disabled={busy || !text.trim()}>Send</Button>
        </div>
        {analyzable && (
          <div className="mt-4">
            <Button variant="ghost" onClick={goNext}>Run Analysis →</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
