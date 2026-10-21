import { useCallback, useEffect, useState } from "react";
import { api, ApiError, AuthConfig, Identity, Readiness, SessionSnapshot, setAccessToken } from "./api";
import Intake from "./components/Intake";
import Diagnose from "./components/Diagnose";
import Analyze from "./components/Analyze";
import Blueprint from "./components/Blueprint";
import Portfolio from "./components/Portfolio";
import { Button } from "./components/ui";

type View = "intake" | "diagnose" | "analyze" | "blueprint" | "portfolio";
const NAV: { id: View; label: string }[] = [
  { id: "intake", label: "1 · Enterprise Intake" },
  { id: "diagnose", label: "2 · Diagnostic Interview" },
  { id: "analyze", label: "3 · Workflow Analysis" },
  { id: "blueprint", label: "4 · Blueprint & Review" },
  { id: "portfolio", label: "Sample Portfolio" },
];
const POINTER = "agentsense.session.v1";
function readPointer(): { session: string; identity: string; view: View } | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(POINTER) || "null");
    return p && typeof p.session === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(p.session)
      && typeof p.identity === "string" && NAV.some((n) => n.id === p.view) ? p : null;
  } catch { return null; }
}
function forgetPointer() { try { sessionStorage.removeItem(POINTER); } catch {} }

export default function App() {
  const [view, setView] = useState<View>("intake");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [auth, setAuth] = useState<AuthConfig | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(true);
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [runtime, setRuntime] = useState<Readiness | null>(null);
  const [runtimeError, setRuntimeError] = useState("");
  const sessionId = snapshot?.session_id || "";

  const connect = useCallback(async () => {
    const who = await api.me();
    setIdentity(who);
    const pointer = readPointer();
    if (pointer?.identity === who.identity) {
      try {
        const state = await api.session(pointer.session);
        setSnapshot(state);
        setView(pointer.view);
        setMessage("Workflow restored from the server.");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) forgetPointer();
        setMessage(e instanceof Error ? e.message : "Could not restore workflow. Retry signing in.");
      }
    } else {
      forgetPointer();
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api.authConfig().then(async (config) => {
      if (!alive) return;
      setAuth(config);
      if (config.mode === "local-demo") await connect();
    }).catch((e: Error) => { if (alive) setMessage(e.message); })
      .finally(() => { if (alive) setStarting(false); });
    return () => { alive = false; };
  }, [connect]);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const ready = await api.readiness();
        if (alive) { setRuntime(ready); setRuntimeError(""); }
      } catch (e) {
        if (alive) setRuntimeError(e instanceof Error ? e.message : "Backend unavailable");
      }
    }
    void refresh();
    const interval = window.setInterval(refresh, 30000);
    const expire = () => { setAccessToken(""); setIdentity(null); setSnapshot(null); setView("intake"); setMessage("Access expired. Sign in again; tokens are never saved in browser storage."); };
    window.addEventListener("agentsense-auth-expired", expire);
    return () => { alive = false; clearInterval(interval); window.removeEventListener("agentsense-auth-expired", expire); };
  }, []);

  useEffect(() => {
    if (!snapshot || !identity) return;
    try {
      sessionStorage.setItem(POINTER, JSON.stringify({ session: snapshot.session_id, identity: identity.identity, view }));
    } catch { setMessage("Browser storage is unavailable. Keep this tab open to retain your workflow pointer."); }
  }, [snapshot, identity, view]);

  async function refreshSession(id = sessionId) {
    const state = await api.session(id);
    setSnapshot(state);
  }
  async function changeView(next: View) {
    if (next === view) return;
    setBusy(true);
    try {
      if (sessionId) await refreshSession();
      setView(next); setConfirmDelete(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        forgetPointer(); setSnapshot(null); setView("intake"); setConfirmDelete(false);
      }
      setMessage(e instanceof Error ? e.message : "Could not refresh workflow. Retry.");
    } finally { setBusy(false); }
  }
  async function signIn() {
    setBusy(true); setMessage(""); setAccessToken(token.trim()); setToken("");
    try { await connect(); }
    catch (e) { setAccessToken(""); setIdentity(null); setMessage(e instanceof Error ? e.message : "Sign-in failed."); }
    finally { setBusy(false); }
  }
  async function removeSession() {
    setBusy(true);
    try {
      await api.deleteSession(sessionId);
      forgetPointer(); setSnapshot(null); setView("intake"); setConfirmDelete(false);
      setMessage("Workflow deleted from the active session store. Backup retention is managed separately.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Deletion failed; retry."); }
    finally { setBusy(false); }
  }
  function newWorkflow() {
    forgetPointer(); setSnapshot(null); setView("intake"); setConfirmDelete(false);
    setMessage("New workflow. The previous server session remains until expiry unless deleted.");
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <a className="sr-only focus:not-sr-only" href="#main-content">Skip to workflow</a>
      <aside className="md:w-64 shrink-0 border-r border-white/10 bg-[#0b0a18] flex flex-col">
        <div className="p-5 border-b border-white/10">
          <div className="text-2xl font-extrabold text-violet-300">AgentSpark</div>
          <p className="text-xs text-slate-400 mt-2">The agent that tells you where agents belong.</p>
          <p role="status" className="text-xs mt-3 text-amber-200">
            {runtimeError ? "Backend unavailable — retrying every 30 seconds"
              : !runtime ? "Checking backend…"
              : runtime.mode === "demo" ? "Demo · fictional fixtures · process-local storage"
              : runtime.ready ? "Azure live · dependencies ready" : "Live · dependencies unavailable"}
          </p>
          <p className="text-xs text-slate-400 mt-2">Status refreshed every 30 seconds.</p>
        </div>
        <nav aria-label="Workflow steps" className="flex-1 p-3 space-y-1">
          {NAV.map((n) => (
            <button key={n.id} disabled={busy || !identity || starting || (!sessionId && !["intake", "portfolio"].includes(n.id))}
              aria-current={view === n.id ? "step" : undefined} onClick={() => void changeView(n.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400 ${view === n.id ? "bg-violet-500/20 text-violet-200" : "text-slate-300 hover:bg-white/5"}`}>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="p-4 space-y-3 text-xs text-slate-400">
          {sessionId && <>
            <p>Workflow: {sessionId.slice(0, 8)} · {snapshot?.status.replace(/_/g, " ")}</p>
            <p>Expires: {new Date(snapshot!.expires_at).toLocaleString()}</p>
            <Button variant="ghost" disabled={busy} onClick={newWorkflow}>New workflow</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete workflow</Button>
          </>}
          {identity && auth?.mode === "oidc" && <Button variant="ghost" disabled={busy} onClick={() => {
            setAccessToken(""); setIdentity(null); setSnapshot(null); setView("intake"); forgetPointer();
          }}>Sign out</Button>}
        </div>
      </aside>
      <main id="main-content" className="flex-1 min-w-0 overflow-y-auto" aria-busy={busy}>
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 space-y-4">
          <div className="text-sm text-amber-100 border border-amber-500/20 rounded-xl p-3">
            Do not submit confidential data or credentials. Pattern-based redaction is best-effort, not anonymization.
            {" "}{auth?.mode === "local-demo" ? "Local demo is unauthenticated and shared; do not expose it publicly." : "Workflows are private to the authenticated owner; review also requires a reviewer role."}
            {" "}Session retention: {auth?.retention_hours ?? "…"} hours. Only an opaque session pointer is kept in this tab.
          </div>
          {message && <p role="status" className="text-sm text-slate-200">{message}</p>}
          {identity && !snapshot && readPointer() && <Button disabled={busy} variant="ghost" onClick={async () => {
            setBusy(true);
            try { await connect(); }
            catch (e) { setMessage(e instanceof Error ? e.message : "Restoration failed. Retry."); }
            finally { setBusy(false); }
          }}>Retry workflow restoration</Button>}
          {!auth && !starting && <Button onClick={() => window.location.reload()}>Retry connection</Button>}
          {confirmDelete && <section role="alertdialog" aria-label="Confirm workflow deletion" aria-describedby="delete-explanation" className="rounded-xl border border-rose-400 p-4">
            <p id="delete-explanation">Permanently delete this workflow from the active store? This cannot be undone.</p>
            <div className="flex gap-3 mt-3">
              <Button disabled={busy} onClick={removeSession}>Confirm delete</Button>
              <Button disabled={busy} variant="ghost" onClick={() => setConfirmDelete(false)} autoFocus>Cancel</Button>
            </div>
          </section>}
          {starting ? <p role="status">Loading access configuration…</p> : !identity ? (
            <section className="space-y-3">
              <h1 className="text-2xl font-bold">Organization access</h1>
              <p className="text-sm text-slate-300">Supply an API access token from your organization's configured OIDC provider. It stays in memory and must be supplied again after reload.</p>
              <label className="block">Access token
                <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)}
                  className="block w-full rounded border border-white/20 bg-white/5 p-2" />
              </label>
              <Button disabled={busy || !token.trim() || !auth} onClick={signIn}>Connect securely</Button>
              {!auth && <p role="alert">Access configuration unavailable. Reload to retry.</p>}
            </section>
          ) : <div key={sessionId || "new"}>
            {view === "intake" && <Intake sessionId={sessionId} initialContext={snapshot ? { ...snapshot.enterprise_context, demo_scenario: snapshot.demo_scenario } : undefined}
              onSaved={async (id: string) => { await refreshSession(id); setView("diagnose"); }}
              onBusyChange={setBusy} />}
            {view === "diagnose" && <Diagnose sessionId={sessionId} context={snapshot?.enterprise_context}
              demoMode={runtime?.mode === "demo"}
              initialHistory={snapshot?.chat_history} onRefresh={refreshSession} onBusyChange={setBusy} goNext={() => void changeView("analyze")} />}
            {view === "analyze" && <Analyze sessionId={sessionId} active initialSnapshot={snapshot}
              onRefresh={refreshSession} onBusyChange={setBusy} goNext={() => void changeView("blueprint")} />}
            {view === "blueprint" && <Blueprint sessionId={sessionId} active canReview={identity.can_review}
              secureReview={auth?.mode === "oidc"} onRefresh={refreshSession} onBusyChange={setBusy} />}
            {view === "portfolio" && <Portfolio />}
          </div>}
        </div>
      </main>
    </div>
  );
}
