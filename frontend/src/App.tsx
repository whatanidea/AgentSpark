import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useBlocker, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, AuthConfig, Identity, parseInviteCode, Readiness, SessionSnapshot, setAccessToken, setTokenProvider, setWorkspace, type WorkspaceSelection } from "./api";
const signInModule = () => import("./auth");
import Intake from "./components/Intake";
import Diagnose from "./components/Diagnose";
import Analyze from "./components/Analyze";
import Blueprint from "./components/Blueprint";
import Portfolio from "./components/Portfolio";
import Home from "./components/Home";
const Landing = lazy(() => import("./components/Landing"));
import Workspaces from "./components/Workspaces";
import Discovery from "./components/Discovery";
import EvidenceRegister from "./components/EvidenceRegister";
import ImplementationReadiness from "./components/ImplementationReadiness";
import Icon from "./components/Icon";
import { Button } from "./components/ui";

type View = "home" | "intake" | "diagnose" | "evidence" | "readiness" | "analyze" | "blueprint" | "workspaces" | "portfolio" | "discovery";
const NAV: { id: View; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "discovery", label: "Discovery engagements" },
  { id: "intake", label: "1 · Enterprise Intake" },
  { id: "diagnose", label: "2 · Diagnostic Interview" },
  { id: "evidence", label: "Evidence & assumptions" },
  { id: "readiness", label: "Implementation readiness" },
  { id: "analyze", label: "3 · Workflow Analysis" },
  { id: "blueprint", label: "4 · Blueprint & Review" },
  { id: "workspaces", label: "Organizations & teams" },
  { id: "portfolio", label: "Sample Portfolio" },
];
const POINTER = "agentsense.session.v1";
function readPointer(): { session: string; identity: string; view: View; workspace?: { organization_id: string; team_id: string } } | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(POINTER) || "null");
    if (p?.workspace && (!/^[A-Za-z0-9_-]{1,100}$/.test(p.workspace.organization_id)
      || !/^[A-Za-z0-9_-]{1,100}$/.test(p.workspace.team_id))) return null;
    return p && typeof p.session === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(p.session)
      && typeof p.identity === "string" && NAV.some((n) => n.id === p.view) ? p : null;
  } catch { return null; }
}
function forgetPointer() { try { sessionStorage.removeItem(POINTER); } catch {} }
/** Invite links carry the code in the URL fragment, which browsers never send to the server. */
function takeInviteFromUrl(): string {
  if (!/^#invite=/.test(window.location.hash)) return "";
  const code = parseInviteCode(window.location.hash);
  window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  return code;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const previousPath = useRef(location.pathname);
  const [view, setView] = useState<View>("home");
  const [showLanding, setShowLanding] = useState(() => location.pathname !== "/workspace");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [auth, setAuth] = useState<AuthConfig | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [discoveryUnsaved, setDiscoveryUnsaved] = useState(false);
  const discoveryUnsavedRef = useRef(false);
  const updateDiscoveryUnsaved = useCallback((dirty: boolean) => {
    discoveryUnsavedRef.current = dirty;
    setDiscoveryUnsaved(dirty);
  }, []);
  const [starting, setStarting] = useState(true);
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [runtime, setRuntime] = useState<Readiness | null>(null);
  const [runtimeError, setRuntimeError] = useState("");
  const [workspace, selectWorkspace] = useState<WorkspaceSelection | null>(null);
  const [pendingInvite, setPendingInvite] = useState(takeInviteFromUrl);
  const websiteDestination = useRef<View | null>(null);
  const sessionId = snapshot?.session_id || "";
  const canWrite = snapshot ? snapshot.permissions.write : workspace?.permissions.write !== false;
  const canDelete = snapshot ? snapshot.permissions.delete : workspace?.permissions.delete !== false;
  const blocker = useBlocker(({ currentLocation, nextLocation, historyAction }) =>
    historyAction === "POP" && discoveryUnsavedRef.current && currentLocation.pathname === "/workspace" && nextLocation.pathname !== "/workspace");
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm("Discard unsaved discovery changes?")) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  useLayoutEffect(() => {
    if (previousPath.current !== location.pathname) {
      previousPath.current = location.pathname;
      setShowLanding(location.pathname !== "/workspace");
    }
  }, [location.pathname]);

  const connect = useCallback(async () => {
    setWorkspace(null); selectWorkspace(null);
    const who = await api.me();
    setIdentity(who);
    const pointer = readPointer();
    if (pointer?.identity === who.identity) {
      try {
        setWorkspace(pointer.workspace ?? null);
        const state = await api.session(pointer.session);
        setSnapshot(state);
        if (window.location.pathname === "/" || window.location.pathname === "/workspace") setShowLanding(false);
        if (state.organization_id && state.team_id) selectWorkspace({
          organization_id: state.organization_id, team_id: state.team_id,
          organization_name: state.workspace?.organization_name || state.organization_id,
          team_name: state.workspace?.team_name || state.team_id, permissions: state.permissions,
        });
        setView(pointer.view);
        setMessage("Workflow restored from the server.");
      } catch (e) {
        setWorkspace(null); selectWorkspace(null);
        if (e instanceof ApiError && e.status === 404) forgetPointer();
        setMessage(e instanceof Error ? e.message : "Could not restore workflow. Retry signing in.");
      }
    } else {
      forgetPointer();
    }
    if (websiteDestination.current) {
      setView(websiteDestination.current); setShowLanding(false);
      websiteDestination.current = null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api.authConfig().then(async (config) => {
      if (!alive) return;
      setAuth(config);
      if (config.mode === "local-demo") { await connect(); return; }
      if (config.sign_in) {
        try { await (await signInModule()).initSignIn(config.sign_in); }
        catch (e) { if (alive) setMessage(e instanceof Error ? `Microsoft sign-in unavailable: ${e.message}` : "Microsoft sign-in unavailable."); }
      }
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
    const active = !showLanding || !!pendingInvite;
    if (active) void refresh();
    const interval = active ? window.setInterval(refresh, 30000) : undefined;
    const expire = () => { setTokenProvider(null); void signInModule().then((m) => m.signOutLocally()); setAccessToken(""); setWorkspace(null); selectWorkspace(null); setIdentity(null); setSnapshot(null); setView("intake"); setMessage("Access expired. Sign in again; tokens are never saved in browser storage."); };
    window.addEventListener("agentsense-auth-expired", expire);
    return () => { alive = false; clearInterval(interval); window.removeEventListener("agentsense-auth-expired", expire); };
  }, [showLanding, pendingInvite]);

  useEffect(() => {
    const onHash = () => { const code = takeInviteFromUrl(); if (code) setPendingInvite(code); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (identity && pendingInvite) { setView("workspaces"); setConfirmDelete(false); }
  }, [identity, pendingInvite]);

  useEffect(() => {
    if (!snapshot || !identity) return;
    try {
      sessionStorage.setItem(POINTER, JSON.stringify({ session: snapshot.session_id, identity: identity.identity, view,
        ...(snapshot.organization_id && snapshot.team_id ? { workspace: {
          organization_id: snapshot.organization_id, team_id: snapshot.team_id } } : {}) }));
    } catch { setMessage("Browser storage is unavailable. Keep this tab open to retain your workflow pointer."); }
  }, [snapshot, identity, view]);

  async function refreshSession(id = sessionId) {
    const state = await api.session(id);
    setSnapshot(state);
  }
  async function changeView(next: View) {
    if (view === "discovery" && next !== view && discoveryUnsaved && !window.confirm("Discard unsaved discovery changes?")) return;
    setShowLanding(false);
    if (next === view) return;
    setBusy(true);
    try {
      if (sessionId && !["workspaces", "discovery"].includes(next)) await refreshSession();
      setView(next); setConfirmDelete(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        forgetPointer(); setSnapshot(null); setView(next === "home" ? "home" : "intake"); setConfirmDelete(false);
      }
      setMessage(e instanceof Error ? e.message : "Could not refresh workflow. Retry.");
    } finally { setBusy(false); }
  }
  async function signIn() {
    setBusy(true); setMessage(""); setTokenProvider(null); setAccessToken(token.trim()); setToken("");
    try { await connect(); }
    catch (e) { setAccessToken(""); setIdentity(null); setMessage(e instanceof Error ? e.message : "Sign-in failed."); }
    finally { setBusy(false); }
  }
  async function signInWithMicrosoft() {
    setBusy(true); setMessage("");
    try {
      const { signInWithPopup, currentToken } = await signInModule();
      setAccessToken(await signInWithPopup()); setTokenProvider(currentToken);
      await connect();
    } catch (e) {
      setTokenProvider(null); setAccessToken(""); setIdentity(null);
      const text = e instanceof Error ? e.message : "";
      setMessage(/popup_window_error|empty_window_error/.test(text)
        ? "Your browser blocked the sign-in window. Allow pop-ups for this site and try again."
        : /user_cancelled/.test(text) ? "Sign-in was cancelled." : `Microsoft sign-in failed. ${text}`);
    } finally { setBusy(false); }
  }
  async function removeSession() {
    setBusy(true);
    try {
      await api.deleteSession(sessionId);
      forgetPointer(); setSnapshot(null); setView("home"); setConfirmDelete(false);
      setMessage("Workflow and all retained decision snapshots deleted. Backup retention is managed separately.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Deletion failed; retry."); }
    finally { setBusy(false); }
  }
  function newWorkflow() {
    if (view === "discovery" && discoveryUnsaved && !window.confirm("Discard unsaved discovery changes?")) return;
    forgetPointer(); setSnapshot(null); setView("intake"); setConfirmDelete(false);
    setMessage("New workflow. The previous server session remains until expiry unless deleted.");
  }
  function changeWorkspace(value: WorkspaceSelection | null) {
    setWorkspace(value); selectWorkspace(value); forgetPointer(); setSnapshot(null);
    setView("home"); setConfirmDelete(false); setMessage("");
  }
  async function openWorkflow(id: string) {
    const state = await api.session(id);
    setSnapshot(state); setConfirmDelete(false); setMessage("");
    setView(["completed", "rejected", "awaiting_human_review"].includes(state.status) ? "blueprint"
      : state.status === "needs_clarification" ? "analyze" : state.chat_history.length ? "diagnose" : "intake");
  }
  function enterFromWebsite(next: View) {
    websiteDestination.current = identity ? null : next;
    void navigate("/workspace");
    void changeView(next);
  }

  if (showLanding && !pendingInvite) return <Suspense fallback={<div role="status" className="min-h-screen grid place-items-center">Loading product overview…</div>}><Landing
    onStart={() => enterFromWebsite(sessionId ? "home" : "intake")}
    onWorkspace={() => enterFromWebsite("home")}
    onDiscover={() => enterFromWebsite("discovery")}
    disabled={busy || starting} hasSession={!!sessionId} signedIn={!!identity} message={message} /></Suspense>;

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <a className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-white focus:p-3" href="#main-content">Skip to workflow</a>
      <aside className="md:w-64 lg:w-72 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/70 flex flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto">
        <div className="px-5 py-5 md:px-6 md:pt-7 md:pb-6">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center h-10 w-10 rounded-xl bg-teal-700 text-white shadow-sm" aria-hidden="true">
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none"><path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7L12 2Z" fill="currentColor" /></svg>
            </span>
            <div>
              <div className="text-xl font-semibold tracking-tight text-slate-900">AgentSpark</div>
              <p className="text-[11px] text-slate-500 mt-0.5">Enterprise transformation advisor</p>
            </div>
          </div>
          <p className="hidden md:block text-xs leading-relaxed text-slate-500 mt-5">The agent that tells you where agents belong.</p>
          <button className="text-xs text-teal-800 mt-4 hover:underline" disabled={busy}
            onClick={() => {
              if (view === "discovery" && discoveryUnsaved && !window.confirm("Discard unsaved discovery changes?")) return;
              void navigate("/"); setShowLanding(true);
            }}>Product overview <span aria-hidden="true">↗</span></button>
        </div>
        <nav aria-label="Workflow steps" className="flex md:block md:flex-1 overflow-x-auto px-4 pb-4 md:pb-5 gap-2 md:space-y-1.5">
          <p className="hidden md:block px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Workspace</p>
          {NAV.map((n, index) => (
            <div key={n.id} className={`shrink-0 ${n.id === "portfolio" ? "md:mt-6 md:pt-5 md:border-t border-slate-200" : ""}`}>
              {n.id === "portfolio" && <p className="hidden md:block px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Explore</p>}
              <button disabled={busy || !identity || starting || (!sessionId && !["home", "intake", "portfolio", "workspaces", "discovery"].includes(n.id))
                || (n.id === "intake" && !sessionId && !canWrite)}
                aria-label={n.label} aria-current={view === n.id ? "step" : undefined} onClick={() => void changeView(n.id)}
                className="nav-item">
                <span className="nav-number" aria-hidden="true">{n.id === "home" || n.id === "portfolio" || n.id === "workspaces" || n.id === "discovery"
                  ? <Icon name={n.id === "workspaces" || n.id === "discovery" ? "portfolio" : n.id} className="h-4 w-4" /> : String(index - 1).padStart(2, "0")}</span>
                <span>{n.label.replace(/^\d · /, "")}</span>
                {view === n.id && <span aria-hidden="true" className="ml-auto text-teal-700">›</span>}
              </button>
            </div>
          ))}
        </nav>
        <div className="mx-5 mb-4 md:mb-5 md:rounded-xl md:border border-slate-200 md:bg-white md:p-4">
          <p className="hidden md:block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Connection status</p>
          <p role="status" className="text-xs leading-relaxed text-slate-700">
            <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full mr-2 ${runtimeError || (runtime && !runtime.ready) ? "bg-amber-500" : runtime ? "bg-teal-600" : "bg-slate-400"}`} />
            {runtimeError ? "Backend unavailable — retrying every 30 seconds"
              : !runtime ? "Checking backend…"
              : runtime.mode === "demo" ? runtime.ready ? "Demo · shared local sessions · retained decision snapshots" : "Demo · decision archive unavailable"
              : runtime.ready ? "Azure live · dependencies ready" : "Live · dependencies unavailable"}
          </p>
          <p className="hidden md:block text-[11px] text-slate-500 mt-2">Status refreshed every 30 seconds.</p>
        </div>
        <div className="px-5 pb-5 space-y-3 text-xs text-slate-500">
          {sessionId && <>
            <p>Workflow: {sessionId.slice(0, 8)} · {snapshot?.status.replace(/_/g, " ")}</p>
            <p>Expires: {new Date(snapshot!.expires_at).toLocaleString()}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" disabled={busy || !canWrite} onClick={newWorkflow}>New workflow</Button>
              <Button variant="ghost" disabled={busy || !canDelete} onClick={() => setConfirmDelete(true)}>Delete workflow</Button>
            </div>
          </>}
          {identity && auth?.mode === "oidc" && <Button variant="ghost" disabled={busy} onClick={() => {
            setAccessToken(""); setWorkspace(null); selectWorkspace(null); setIdentity(null); setSnapshot(null); setView("home"); setShowLanding(true); forgetPointer();
            void navigate("/", { replace: true });
          }}>Sign out</Button>}
        </div>
      </aside>
      <main id="main-content" className="flex-1 min-w-0 bg-white" aria-busy={busy}>
        <div className="min-h-16 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3 px-5 md:px-10 py-4">
          <p className="text-xs text-slate-500">Workspace <span className="mx-2 text-slate-300">/</span> <span className="font-medium text-slate-700">{NAV.find((n) => n.id === view)?.label.replace(/^\d · /, "")}</span></p>
          <span className="text-[11px] font-medium text-teal-800 bg-teal-50 border border-teal-100 rounded-full px-3 py-1">{workspace ? `${workspace.organization_name} / ${workspace.team_name}` : "Personal workspace"}</span>
        </div>
        <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-10 py-7 md:py-9 space-y-6">
          <div className="notice">
            <svg aria-hidden="true" className="shrink-0 mt-0.5 text-slate-500" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m9 12 2 2 4-4" /></svg>
            <div>
              <p className="font-medium">Do not submit confidential data or credentials.</p>
              <details className="mt-0.5">
                <summary className="text-slate-500">Privacy, access & retention details</summary>
                <p className="mt-2">Pattern-based redaction is best-effort, not anonymization.
                  {" "}{auth?.mode === "local-demo" ? "Local demo is unauthenticated and shared; do not expose it publicly." : "Personal workflows are owner-private. Team workflows require active membership and scoped permissions. Team reviewers cannot review their own workflows; personal review requires the configured token role."}
                  {" "}Session retention: {auth?.retention_hours ?? "…"} hours; decision snapshots: {auth?.archive_retention_days ?? "…"} days.
                  {" "}Deleting a workflow also deletes its decision archive. Only an opaque session pointer is kept in this tab.
                </p>
              </details>
            </div>
          </div>
          {message && <p role="status" className="notice">{message}</p>}
          {snapshot && <p className="text-xs text-slate-600">Assessment target: <strong>{snapshot.enterprise_context.target_cloud === "aws" ? "AWS" : "Azure"}</strong>
            {" "} / Region: {snapshot.enterprise_context.preferred_region || "not specified"} (unverified). AgentSpark hosting is unchanged.</p>}
          {snapshot && <p className="text-xs text-slate-600">Assessment model: <strong>{snapshot.inference_model
            ? `${snapshot.inference_model.provider} / ${snapshot.inference_model.model}` : "Legacy Azure OpenAI default (historical provenance not recorded)"}</strong>.
            {" "}No automatic provider fallback.</p>}
          {snapshot?.discovery_origin && <details className="notice">
            <summary>Discovery origin: {snapshot.discovery_origin.title} (unverified)</summary>
            <p>Reviewed for handoff, not confirmed as workflow facts. All readiness and diagnostic gates still apply.</p>
            <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(snapshot.discovery_origin, null, 2)}</pre>
          </details>}
          {identity && !snapshot && readPointer() && <Button disabled={busy} variant="ghost" onClick={async () => {
            setBusy(true);
            try { await connect(); }
            catch (e) { setMessage(e instanceof Error ? e.message : "Restoration failed. Retry."); }
            finally { setBusy(false); }
          }}>Retry workflow restoration</Button>}
          {!auth && !starting && <Button onClick={() => window.location.reload()}>Retry connection</Button>}
          {confirmDelete && <section role="alertdialog" aria-label="Confirm workflow deletion" aria-describedby="delete-explanation" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
            <h2 className="font-semibold mb-2">Delete this workflow?</h2>
            <p id="delete-explanation">Permanently delete this workflow and all its decision snapshots, including reviewer comments? This cannot be undone.</p>
            <div className="flex flex-wrap gap-3 mt-4">
              <Button variant="danger" disabled={busy} onClick={removeSession}>Confirm delete</Button>
              <Button disabled={busy} variant="ghost" onClick={() => setConfirmDelete(false)} autoFocus>Cancel</Button>
            </div>
          </section>}
          {starting ? <p role="status">Loading access configuration…</p> : !identity ? (
            <section className="surface-card max-w-xl space-y-4">
              <h1 className="text-2xl font-bold">Organization access</h1>
              {pendingInvite && <p role="status" className="notice">You opened an invite link. Sign in first; you can then accept the invite on the Organizations & teams page.</p>}
              {auth?.sign_in ? <>
                <p className="text-sm text-slate-600 leading-relaxed">Sign in with your organization's Microsoft account. Your session stays in this tab only.</p>
                <Button disabled={busy} onClick={signInWithMicrosoft}>Sign in with Microsoft</Button>
              </> : null}
              <details className="text-sm" open={!auth?.sign_in}>
                <summary className="cursor-pointer text-slate-600">{auth?.sign_in ? "Use an access token instead" : "Access token"}</summary>
                <div className="space-y-4 mt-3">
                  <p className="text-sm text-slate-600 leading-relaxed">Supply an API access token from your organization's configured OIDC provider. It stays in memory and must be supplied again after reload.</p>
                  <label className="block">Access token
                    <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)}
                      className="form-control block mt-2" />
                  </label>
                  <Button disabled={busy || !token.trim() || !auth} onClick={signIn}>Connect securely</Button>
                </div>
              </details>
              {!auth && <p role="alert">Access configuration unavailable. Reload to retry.</p>}
            </section>
          ) : <div key={sessionId || "new"}>
            {view === "workspaces" && <Workspaces identity={identity.identity} demo={auth?.mode === "local-demo"}
              onSelect={changeWorkspace} onBusyChange={setBusy} inviteCode={pendingInvite}
              onInviteHandled={() => setPendingInvite("")} />}
            {view === "discovery" && <Discovery canCreate={workspace?.permissions.write !== false}
              onOpen={openWorkflow} onBusyChange={setBusy} onUnsavedChange={updateDiscoveryUnsaved}
              onManageAccess={() => void changeView("workspaces")} />}
            {view === "home" && <Home demo={auth?.mode === "local-demo"} retentionDays={auth?.archive_retention_days ?? 30}
              workspaceName={workspace ? `${workspace.organization_name} / ${workspace.team_name}` : undefined}
              canCreate={workspace?.permissions.write !== false}
              onCreate={newWorkflow} onOpen={openWorkflow} onBusyChange={setBusy}
              onDeleted={(id) => {
                if (id === sessionId) { forgetPointer(); setSnapshot(null); }
                setMessage("Workflow and all retained decision snapshots deleted.");
              }} />}
            {snapshot && !canWrite && ["intake", "diagnose", "analyze"].includes(view) && <p className="notice">Read-only access: your current team permissions do not allow workflow changes.</p>}
            {view === "intake" && <fieldset disabled={!canWrite} className="min-w-0"><Intake sessionId={sessionId} initialContext={snapshot ? { ...snapshot.enterprise_context, demo_scenario: snapshot.demo_scenario } : undefined}
              initialModel={snapshot?.inference_model}
              modelLocked={Boolean(snapshot && (snapshot.model_locked || snapshot.chat_history.length || snapshot.interview_diagnosis || snapshot.analysis_id || snapshot.trace.length))}
              onSaved={async (id: string) => { await refreshSession(id); setView("diagnose"); }}
              onBusyChange={setBusy} /></fieldset>}
            {view === "diagnose" && <fieldset disabled={!canWrite} className="min-w-0"><Diagnose sessionId={sessionId} context={snapshot?.enterprise_context}
              demoMode={runtime?.mode === "demo"}
              hasAnalysis={!!snapshot?.analysis_id}
              initialHistory={snapshot?.chat_history} onRefresh={refreshSession} onBusyChange={setBusy} goNext={() => void changeView("analyze")} /></fieldset>}
            {view === "evidence" && <EvidenceRegister sessionId={sessionId} hasAnalysis={!!snapshot?.analysis_id}
              onRefresh={refreshSession} onBusyChange={setBusy} />}
            {view === "readiness" && <ImplementationReadiness sessionId={sessionId} hasAnalysis={!!snapshot?.analysis_id}
              onRefresh={refreshSession} onBusyChange={setBusy} />}
            {view === "analyze" && <fieldset disabled={!canWrite} className="min-w-0"><Analyze sessionId={sessionId} active initialSnapshot={snapshot}
              onRefresh={refreshSession} onBusyChange={setBusy} goNext={() => void changeView("blueprint")} /></fieldset>}
            {view === "blueprint" && <Blueprint sessionId={sessionId} active canReview={snapshot?.permissions.review === true}
              secureReview={auth?.mode === "oidc"} onRefresh={refreshSession} onBusyChange={setBusy} />}
            {view === "portfolio" && <Portfolio />}
          </div>}
        </div>
      </main>
    </div>
  );
}
