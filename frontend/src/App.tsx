import { useEffect, useState } from "react";
import { api, Readiness } from "./api";
import Intake from "./components/Intake";
import Diagnose from "./components/Diagnose";
import Analyze from "./components/Analyze";
import Blueprint from "./components/Blueprint";
import Portfolio from "./components/Portfolio";

type View = "intake" | "diagnose" | "analyze" | "blueprint" | "portfolio";

const NAV: { id: View; label: string; icon: string; step?: string }[] = [
  { id: "intake", label: "Enterprise Intake", icon: "🏢", step: "1" },
  { id: "diagnose", label: "Diagnostic Agent", icon: "💬", step: "2" },
  { id: "analyze", label: "Workflow Analysis", icon: "📈", step: "3" },
  { id: "blueprint", label: "Blueprint", icon: "📐", step: "4" },
  { id: "portfolio", label: "Portfolio Planner", icon: "📊" },
];

export default function App() {
  const [view, setView] = useState<View>("intake");
  const [sessionId, setSessionId] = useState<string>("");
  const [context, setContext] = useState<any>(null);   // intake context, shared with the Diagnostic
  const [runtime, setRuntime] = useState<Readiness | null>(null);
  const [runtimeError, setRuntimeError] = useState("");

  useEffect(() => {
    Promise.all([api.health(), api.readiness()])
      .then(([, ready]) => setRuntime(ready))
      .catch((error: Error) => setRuntimeError(error.message));
  }, []);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-white/10 bg-[#0b0a18] flex flex-col">
        <div className="p-5 border-b border-white/10">
          <div className="text-2xl font-extrabold bg-gradient-to-r from-fuchsia-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
            AgentSense
          </div>
          <div className="text-[11px] text-slate-500 mt-1 leading-snug">
            The agent that tells you where agents belong.
          </div>
          <div className="mt-3">
            {runtimeError ? (
              <span className="text-[11px] text-rose-300">Backend unavailable: {runtimeError}</span>
            ) : runtime === null ? (
              <span className="text-[11px] text-slate-500">checking…</span>
            ) : runtime.mode === "live" ? (
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${runtime.ready ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                {runtime.ready ? "● Azure Live — ready" : "Live — dependencies unavailable"}
              </span>
            ) : (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300">◐ Demo / Mock Mode</span>
            )}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                view === n.id ? "bg-violet-500/15 text-violet-200 border border-violet-500/30" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <span>{n.icon}</span>
              <span className="flex-1 text-left">{n.label}</span>
              {n.step && <span className="text-[10px] text-slate-500">{n.step}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10 text-[11px] text-slate-500">
          {sessionId ? (
            <span className="text-emerald-400/80">● session active</span>
          ) : (
            <span>no session — start at Intake</span>
          )}
          <div className="mt-2 text-slate-600">Shriram K Vasudevan</div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">
          {/* All views stay MOUNTED — we toggle visibility so each agent's state
              (chat history, analysis results, blueprint) persists across navigation. */}
          <div hidden={view !== "intake"}><Intake sessionId={sessionId} setSessionId={setSessionId} setContext={setContext} goNext={() => setView("diagnose")} /></div>
          <div hidden={view !== "diagnose"}><Diagnose sessionId={sessionId} setSessionId={setSessionId} context={context} goNext={() => setView("analyze")} /></div>
          <div hidden={view !== "analyze"}><Analyze key={sessionId} sessionId={sessionId} active={view === "analyze"} goNext={() => setView("blueprint")} /></div>
          <div hidden={view !== "blueprint"}><Blueprint key={sessionId} sessionId={sessionId} active={view === "blueprint"} /></div>
          <div hidden={view !== "portfolio"}><Portfolio /></div>
        </div>
      </main>
    </div>
  );
}
