import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useBlocker, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, AuthConfig, Identity, parseInviteCode, Readiness, SessionSnapshot, setAccessToken, setTokenProvider, setWorkspace, type InviteRedemption, type WorkspaceSelection } from "./api";
const signInModule = () => import("./auth");
import Intake from "./components/Intake";
import ProcessingStatus from "./components/ProcessingStatus";
import Diagnose from "./components/Diagnose";
import Analyze from "./components/Analyze";
import Blueprint from "./components/Blueprint";
import Portfolio from "./components/Portfolio";
import Home from "./components/Home";
const Landing = lazy(() => import("./components/Landing"));
import Workspaces from "./components/Workspaces";
import InviteOnboarding from "./components/InviteOnboarding";
import Discovery from "./components/Discovery";
import DiscoveryOriginSummary from "./components/DiscoveryOriginSummary";
import EvidenceRegister from "./components/EvidenceRegister";
import ImplementationReadiness from "./components/ImplementationReadiness";
import Icon from "./components/Icon";
import { Button, Card } from "./components/ui";
import useInactivitySignOut from "./useInactivitySignOut";

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
const INVITATION = "agentspark.invitation.v1";
type PendingInvitation = { code: string; warning: string };
/** Keep the pending invitation in this tab across sign-in retries and reloads, never in localStorage. */
function takeInviteFromUrl(): PendingInvitation | null {
  if (!/^#invite=/.test(window.location.hash)) return null;
  const code = parseInviteCode(window.location.hash);
  try {
    sessionStorage.setItem(INVITATION, code);
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    return { code, warning: "" };
  } catch {
    return { code, warning: "Tab storage is unavailable. Keep this invitation URL and tab open until you finish joining." };
  }
}
function restoreInvitation(): PendingInvitation {
  const incoming = takeInviteFromUrl();
  if (incoming) return incoming;
  try { return { code: sessionStorage.getItem(INVITATION) || "", warning: "" }; }
  catch { return { code: "", warning: "Tab storage is unavailable. Reopen your invitation link if needed." }; }
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const previousPath = useRef(location.pathname);
  const [view, setView] = useState<View>("home");
  const [discoveryEntry, setDiscoveryEntry] = useState<{ id?: string; createNew?: boolean } | null>(null);
  const [showLanding, setShowLanding] = useState(() => location.pathname !== "/workspace");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [auth, setAuth] = useState<AuthConfig | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [discoveryUnsaved, setDiscoveryUnsaved] = useState(false);
  const discoveryUnsavedRef = useRef(false);
  const [documentUnsaved, setDocumentUnsaved] = useState(false);
  const [editorUnsaved, setEditorUnsaved] = useState(false);
  const updateEditorUnsaved = useCallback((dirty: boolean) => setEditorUnsaved(dirty), []);
  const [intakeEntry, setIntakeEntry] = useState(0);
  const documentUnsavedRef = useRef(false);
  const updateDocumentUnsaved = useCallback((dirty: boolean) => {
    documentUnsavedRef.current = dirty;
    setDocumentUnsaved(dirty);
  }, []);
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
  const [homeLibrary, setHomeLibrary] = useState<"workflows" | "discovery">("workflows");
  const [invitedOrganization, setInvitedOrganization] = useState("");
  const [invitation, setInvitation] = useState(restoreInvitation);
  const pendingInvite = invitation.code;
  const [signedInAs, setSignedInAs] = useState("");
  const [invitationInput, setInvitationInput] = useState("");
  const websiteDestination = useRef<View | null>(null);
  const sessionId = snapshot?.session_id || "";
  const canWrite = snapshot ? snapshot.permissions.write : workspace?.permissions.write !== false;
  const canDelete = snapshot ? snapshot.permissions.delete : workspace?.permissions.delete !== false;
  const blocker = useBlocker(({ currentLocation, nextLocation, historyAction }) =>
    historyAction === "POP" && (discoveryUnsavedRef.current || documentUnsavedRef.current) && currentLocation.pathname === "/workspace" && nextLocation.pathname !== "/workspace");
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm(documentUnsavedRef.current ? "Discard the unapproved document context?" : "Discard unsaved discovery changes?")) blocker.proceed();
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
    setWorkspace(null); selectWorkspace(null); setInvitedOrganization("");
    const who = await api.me();
    setIdentity(who);
    if (!who.platform_access) {
      forgetPointer(); setSnapshot(null);
      return;
    }
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

  const disconnect = useCallback((reason = "") => {
    setTokenProvider(null); setAccessToken(""); setWorkspace(null); selectWorkspace(null);
    setIdentity(null); setSignedInAs(""); setInvitedOrganization(""); setSnapshot(null); forgetPointer();
    setToken(""); setDiscoveryEntry(null); setConfirmDelete(false); setRuntime(null); setRuntimeError("");
    setHomeLibrary("workflows");
    setMessage(reason); setBusy(true);
    void signInModule().then(module => module.signOutLocally())
      .catch(() => setMessage(`${reason} The local sign-in client could not be reset. Reload before signing in again.`.trim()))
      .finally(() => setBusy(false));
  }, []);
  const signOutForInactivity = useCallback(() => {
    disconnect("Signed out after 5 minutes of inactivity. Saved records remain intact. Sign in again to continue.");
    setView("home"); setShowLanding(false);
    void navigate("/workspace", { replace: true });
  }, [disconnect, navigate]);
  const unsaved = discoveryUnsaved || documentUnsaved || editorUnsaved;
  const { warning, staySignedIn } = useInactivitySignOut(
    auth?.mode === "oidc" ? identity?.identity || "" : "", unsaved, busy, signOutForInactivity,
  );
  const inactivityNotice = warning && <section role="alert" aria-label="Inactivity warning"
    className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded border border-brand-200 bg-white p-5 shadow-lg space-y-3">
    <h2 className="font-semibold">Your session is inactive</h2>
    {warning.paused === "draft" ? <p>Automatic sign-out is paused because you have unsaved work. Save or discard your drafts, or choose Stay signed in. Unsaved work does not extend an expired access token.</p>
      : warning.paused === "operation" ? <p>Automatic sign-out is waiting for the current operation to finish.</p>
      : <p aria-live="off">Automatic sign-out in {Math.floor(warning.remainingSeconds / 60)}:{String(warning.remainingSeconds % 60).padStart(2, "0")}. Unsaved drafts will pause sign-out.</p>}
    <div className="flex flex-wrap gap-3">
      <Button onClick={staySignedIn}>Stay signed in</Button>
      <Button variant="ghost" disabled={busy} onClick={() => {
        if (!unsaved || window.confirm("Sign out and discard unsaved changes? Saved records remain intact.")) signOutForInactivity();
      }}>Sign out now</Button>
    </div>
  </section>;

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
    const requireInvitation = () => {
      setIdentity(current => current ? { ...current, platform_access: false, can_review: false } : current);
      setWorkspace(null); selectWorkspace(null); setSnapshot(null); setInvitedOrganization("");
      forgetPointer(); setMessage("Platform access is no longer active. Ask an administrator for a new invitation.");
    };
    window.addEventListener("agentspark-invitation-required", requireInvitation);
    return () => window.removeEventListener("agentspark-invitation-required", requireInvitation);
  }, []);

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
    const active = !!identity?.platform_access && (!showLanding || !!pendingInvite);
    if (active) void refresh();
    const interval = active ? window.setInterval(refresh, 30000) : undefined;
    const expire = () => {
      if (!identity) return;
      disconnect("Access expired. Sign in again; tokens are never saved in browser storage.");
      setView("intake");
    };
    window.addEventListener("agentsense-auth-expired", expire);
    return () => { alive = false; clearInterval(interval); window.removeEventListener("agentsense-auth-expired", expire); };
  }, [showLanding, pendingInvite, identity?.platform_access, disconnect]);

  useEffect(() => {
    const onHash = () => { const incoming = takeInviteFromUrl(); if (incoming) setInvitation(incoming); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!snapshot || !identity?.platform_access) return;
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
    if (view === "intake" && next !== view && documentUnsaved && !window.confirm("Discard the unapproved document context?")) return;
    setShowLanding(false);
    if (next === view) return;
    setBusy(true);
    try {
      if (sessionId && !["workspaces", "discovery"].includes(next)) await refreshSession();
      if (next === "discovery") setDiscoveryEntry(null);
      if (next === "home") setHomeLibrary("workflows");
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
  async function signInWithMicrosoft(email?: string) {
    setBusy(true); setMessage("");
    try {
      const { signInWithPopup, currentToken, accountLabel } = await signInModule();
      setAccessToken(await signInWithPopup(email)); setTokenProvider(currentToken);
      setSignedInAs(accountLabel());
      await connect();
    } catch (e) {
      setTokenProvider(null); setAccessToken(""); setIdentity(null); setSignedInAs("");
      const text = e instanceof Error ? e.message : "";
      setMessage(/popup_window_error|empty_window_error/.test(text)
        ? "Your browser blocked the sign-in window. Allow pop-ups for this site and try again."
        : /user_cancelled/.test(text) ? "Sign-in was cancelled. Your invitation is retained; try again when ready."
        : /AADSTS50020|AADSTS90072|AADSTS500208/.test(text)
          ? "This account cannot enter the configured Entra tenant yet. Ask the administrator to invite your email as an Entra guest. Public sign-up is not enabled. Your invitation is retained."
          : `Microsoft sign-in failed. ${text}`);
    } finally { setBusy(false); }
  }
  function clearInvitation() {
    setInvitation({ code: "", warning: "" });
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    try { sessionStorage.removeItem(INVITATION); return ""; }
    catch { return "The invitation could not be cleared from tab storage. Close this tab when finished."; }
  }
  function finishInvitation(joined: InviteRedemption) {
    setIdentity(current => current ? { ...current, platform_access: true } : current);
    const warning = clearInvitation();
    if (joined.workspace) {
      changeWorkspace(joined.workspace);
      setMessage(`Welcome to ${joined.workspace.organization_name} / ${joined.workspace.team_name}. ${warning}`.trim());
    } else {
      changeWorkspace(null);
      setInvitedOrganization(joined.organization_id);
      setView("workspaces");
      setMessage(`Joined ${joined.name}. This invitation includes organization membership only; ask an administrator for team access. ${warning}`.trim());
    }
    setShowLanding(false);
    void navigate("/workspace", { replace: true });
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
    if (view === "intake" && documentUnsaved && !window.confirm("Discard the unapproved document context?")) return;
    setIntakeEntry(current => current + 1);
    forgetPointer(); setSnapshot(null); setView("intake"); setConfirmDelete(false);
    setMessage("New workflow. The previous server session remains until expiry unless deleted.");
  }
  function changeWorkspace(value: WorkspaceSelection | null, library: "workflows" | "discovery" = "workflows") {
    setHomeLibrary(library);
    setWorkspace(value); selectWorkspace(value); setInvitedOrganization(""); forgetPointer(); setSnapshot(null);
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

  if (pendingInvite) return <>{inactivityNotice}<InviteOnboarding code={pendingInvite} warning={invitation.warning}
    auth={auth} identity={identity} accountLabel={signedInAs} starting={starting} busy={busy} message={message}
    onSignIn={signInWithMicrosoft} onSwitchAccount={() => disconnect()} onJoined={finishInvitation} onBusyChange={setBusy}
    onCancel={() => { setMessage(clearInvitation()); setShowLanding(false); void navigate("/workspace", { replace: true }); }} /></>;

  if (showLanding) return <>{inactivityNotice}<Suspense fallback={<div role="status" className="min-h-screen grid place-items-center">Loading product overview…</div>}><Landing
    onStart={() => enterFromWebsite(sessionId ? "home" : "intake")}
    onWorkspace={() => enterFromWebsite("home")}
    onDiscover={() => enterFromWebsite("discovery")}
    disabled={busy || starting} hasSession={!!sessionId} signedIn={!!identity} message={message} /></Suspense></>;

  if (identity && !identity.platform_access) return <main className="min-h-screen bg-canvas px-4 py-12">
    {inactivityNotice}
    <div className="max-w-xl mx-auto space-y-5">
      <p className="text-xl font-bold">AgentSpark</p>
      <Card>
        <p className="eyebrow mb-3">Private platform</p>
        <h1 className="text-2xl font-bold">Invitation required</h1>
        <p className="text-sm text-zinc-600 mt-4">Your account is signed in, but this platform is invitation-only.
          Signing in does not grant access to assessments, uploads or AI processing. Ask your administrator for a private invitation link.</p>
        {message && <p role="status" className="notice mt-4">{message}</p>}
        <form className="space-y-4 mt-5" onSubmit={event => {
          event.preventDefault();
          window.location.hash = `invite=${encodeURIComponent(parseInviteCode(invitationInput))}`;
        }}>
          <label className="block text-sm">Invitation link or code
            <input className="form-control block mt-2" required maxLength={400} autoComplete="off" spellCheck={false}
              value={invitationInput} onChange={event => setInvitationInput(event.target.value)} />
          </label>
          <Button type="submit" disabled={busy || !invitationInput.trim()}>Open invitation</Button>
        </form>
        <details className="mt-5 text-sm">
          <summary>Your identity ID for administrator approval</summary>
          <input aria-label="Identity ID for administrator approval" readOnly value={identity.identity}
            className="form-control block mt-2 font-mono text-xs" />
        </details>
        <div className="flex flex-wrap gap-3 mt-5">
          <Button variant="ghost" disabled={busy} onClick={async () => {
            setBusy(true); setMessage("");
            try { await connect(); }
            catch (e) { setMessage(e instanceof Error ? e.message : "Access could not be checked. Retry."); }
            finally { setBusy(false); }
          }}>Check access again</Button>
          <Button variant="ghost" disabled={busy} onClick={() => disconnect()}>Use a different account</Button>
        </div>
      </Card>
    </div>
  </main>;

  return (
    <div className="portal min-h-screen flex flex-col md:flex-row">
      <a className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-white focus:p-3" href="#main-content">Skip to workflow</a>
      <aside className="portal-sidebar md:w-64 lg:w-72 shrink-0 border-b md:border-b-0 md:border-r border-white/10 bg-graphite flex flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto">
        <div className="px-5 py-5 md:px-6 md:pt-7 md:pb-6">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center h-10 w-10 rounded-sm bg-white text-graphite" aria-hidden="true">
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none"><path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7L12 2Z" fill="currentColor" /></svg>
            </span>
            <div>
              <div className="text-xl font-medium tracking-tight text-white">AgentSpark</div>
              <p className="text-[11px] text-white/70 mt-0.5">Enterprise transformation advisor</p>
            </div>
          </div>
          <p className="hidden md:block text-xs leading-relaxed text-white/70 mt-5">The agent that tells you where agents belong.</p>
          <button className="text-xs text-brand-300 min-h-11 mt-2 hover:underline" disabled={busy}
            onClick={() => {
              if (view === "discovery" && discoveryUnsaved && !window.confirm("Discard unsaved discovery changes?")) return;
              if (view === "intake" && documentUnsaved && !window.confirm("Discard the unapproved document context?")) return;
              void navigate("/"); setShowLanding(true);
            }}>Product overview <span aria-hidden="true">↗</span></button>
        </div>
        <nav aria-label="Workflow steps" className="flex md:block md:flex-1 overflow-x-auto px-4 pb-4 md:pb-5 gap-2 md:space-y-1.5">
          <p className="hidden md:block px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-white/70">Workspace</p>
          {NAV.map((n, index) => (
            <div key={n.id} className={`shrink-0 ${n.id === "portfolio" ? "md:mt-6 md:pt-5 md:border-t border-white/15" : ""}`}>
              {n.id === "portfolio" && <p className="hidden md:block px-3 pb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-white/70">Explore</p>}
              <button disabled={busy || !identity || starting || (!sessionId && !["home", "intake", "portfolio", "workspaces", "discovery"].includes(n.id))
                || (n.id === "intake" && !sessionId && !canWrite)}
                aria-label={n.label} aria-current={view === n.id ? "step" : undefined} onClick={() => void changeView(n.id)}
                className="nav-item">
                <span className="nav-number" aria-hidden="true">{n.id === "home" || n.id === "portfolio" || n.id === "workspaces" || n.id === "discovery"
                  ? <Icon name={n.id === "workspaces" || n.id === "discovery" ? "portfolio" : n.id} className="h-4 w-4" /> : String(index - 1).padStart(2, "0")}</span>
                <span>{n.label.replace(/^\d · /, "")}</span>
                {view === n.id && <span aria-hidden="true" className="ml-auto text-brand-700">›</span>}
              </button>
            </div>
          ))}
        </nav>
        <div className="mx-5 mb-4 md:mb-5 md:rounded md:border border-white/15 md:bg-white/5 md:p-4">
          <p className="hidden md:block text-[10px] font-medium uppercase tracking-wider text-white/70 mb-2">Connection status</p>
          <p role="status" className="text-xs leading-relaxed text-white/85">
            <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full mr-2 ${runtimeError || (runtime && !runtime.ready) ? "bg-amber-500" : runtime ? "bg-brand-300" : "bg-zinc-400"}`} />
            {runtimeError ? "Backend unavailable — retrying every 30 seconds"
              : !runtime ? "Checking backend…"
              : runtime.mode === "demo" ? runtime.ready ? "Demo · shared local sessions · retained decision snapshots" : "Demo · decision archive unavailable"
              : runtime.ready ? "Azure live · dependencies ready" : "Live · dependencies unavailable"}
          </p>
          <p className="hidden md:block text-[11px] text-white/70 mt-2">Status refreshed every 30 seconds.</p>
        </div>
        <div className="px-5 pb-5 space-y-3 text-xs text-white/70">
          {sessionId && <>
            <p>Workflow: {sessionId.slice(0, 8)} · {snapshot?.status.replace(/_/g, " ")}</p>
            <p>Expires: {new Date(snapshot!.expires_at).toLocaleString()}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" disabled={busy || !canWrite} onClick={newWorkflow}>New workflow</Button>
              <Button variant="ghost" disabled={busy || !canDelete} onClick={() => setConfirmDelete(true)}>Delete workflow</Button>
            </div>
          </>}
          {identity && auth?.mode === "oidc" && <Button variant="ghost" disabled={busy} onClick={() => {
            disconnect(); setView("home"); setShowLanding(true);
            void navigate("/", { replace: true });
          }}>Sign out</Button>}
        </div>
      </aside>
      <main id="main-content" className="flex-1 min-w-0 bg-canvas" aria-busy={busy}>
        {inactivityNotice}
        <div className="min-h-16 border-b border-line bg-white flex items-center justify-between flex-wrap gap-3 px-5 md:px-10 py-4">
          <p className="text-xs text-zinc-500">Workspace <span className="mx-2 text-zinc-300">/</span> <span className="font-medium text-zinc-700">{NAV.find((n) => n.id === view)?.label.replace(/^\d · /, "")}</span></p>
          <span className="max-w-full break-words text-[11px] font-medium text-brand-800 bg-brand-50 border border-brand-100 rounded-sm px-3 py-1">{workspace ? `${workspace.organization_name} / ${workspace.team_name}` : "Personal workspace"}</span>
        </div>
        <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-10 py-7 md:py-9 space-y-6">
          <div className="notice">
            <svg aria-hidden="true" className="shrink-0 mt-0.5 text-zinc-500" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m9 12 2 2 4-4" /></svg>
            <div>
              <p className="font-medium">Do not submit confidential data or credentials.</p>
              <details className="mt-0.5">
                <summary className="text-zinc-500">Privacy, access & retention details</summary>
                <p className="mt-2">Pattern-based redaction is best-effort, not anonymization.
                  {" "}{auth?.mode === "local-demo" ? "Local demo is unauthenticated and shared; do not expose it publicly." : "Personal workflows are owner-private. Team workflows require active membership and scoped permissions. Team reviewers cannot review their own workflows; personal review requires the configured token role."}
                  {" "}Session retention: {auth?.retention_hours ?? "…"} hours; decision snapshots: {auth?.archive_retention_days ?? "…"} days.
                  {" "}Deleting a workflow also deletes its decision archive. An opaque session pointer and any pending invitation code are kept in this tab.
                </p>
              </details>
            </div>
          </div>
          {message && <p role="status" className="notice">{message}</p>}
          {snapshot && <p className="text-xs text-zinc-600">Assessment target: <strong>{snapshot.enterprise_context.target_cloud === "aws" ? "AWS" : "Azure"}</strong>
            {" "} / Region: {snapshot.enterprise_context.preferred_region || "not specified"} (unverified). AgentSpark hosting is unchanged.</p>}
          {snapshot && <p className="text-xs text-zinc-600">Assessment model: <strong>{snapshot.inference_model
            ? `${snapshot.inference_model.provider} / ${snapshot.inference_model.model}` : "Legacy Azure OpenAI default (historical provenance not recorded)"}</strong>.
            {" "}No automatic provider fallback.</p>}
          {snapshot?.discovery_origin && <details className="notice">
            <summary>Discovery origin: {snapshot.discovery_origin.title} (unverified)</summary>
            <p>Reviewed for handoff, not confirmed as workflow facts. All readiness and diagnostic gates still apply.</p>
            <DiscoveryOriginSummary origin={snapshot.discovery_origin} />
            <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(snapshot.discovery_origin, null, 2)}</pre>
          </details>}
          {identity && !snapshot && readPointer() && <Button disabled={busy} variant="ghost" onClick={async () => {
            setBusy(true);
            try { await connect(); }
            catch (e) { setMessage(e instanceof Error ? e.message : "Restoration failed. Retry."); }
            finally { setBusy(false); }
          }}>Retry workflow restoration</Button>}
          {!auth && !starting && <Button onClick={() => window.location.reload()}>Retry connection</Button>}
          {confirmDelete && <section role="alertdialog" aria-label="Confirm workflow deletion" aria-describedby="delete-explanation" className="rounded border border-rose-200 bg-rose-50 p-5 text-rose-900">
            <h2 className="font-semibold mb-2">Delete this workflow?</h2>
            <p id="delete-explanation">Permanently delete this workflow and all its decision snapshots, including reviewer comments? This cannot be undone.</p>
            <div className="flex flex-wrap gap-3 mt-4">
              <Button variant="danger" disabled={busy} onClick={removeSession}>Confirm delete</Button>
              <Button disabled={busy} variant="ghost" onClick={() => setConfirmDelete(false)} autoFocus>Cancel</Button>
            </div>
          </section>}
          {identity && <ProcessingStatus />}
          {starting ? <p role="status">Loading access configuration…</p> : !identity ? (
            <section className="surface-card max-w-xl space-y-4">
              <h1 className="text-2xl font-bold">Organization access</h1>
              {auth?.sign_in ? <>
                <p className="text-sm text-zinc-600 leading-relaxed">Sign in with your organization's Microsoft account. Your session stays in this tab only.</p>
                <Button disabled={busy} onClick={() => void signInWithMicrosoft()}>Sign in with Microsoft</Button>
              </> : null}
              <details className="text-sm" open={!auth?.sign_in}>
                <summary className="cursor-pointer text-zinc-600">{auth?.sign_in ? "Use an access token instead" : "Access token"}</summary>
                <div className="space-y-4 mt-3">
                  <p className="text-sm text-zinc-600 leading-relaxed">Supply an API access token from your organization's configured OIDC provider. It stays in memory and must be supplied again after reload.</p>
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
              onSelect={changeWorkspace} onBusyChange={setBusy} onUnsavedChange={updateEditorUnsaved} initialOrganizationId={workspace?.organization_id || invitedOrganization} />}
            {view === "discovery" && <Discovery canCreate={workspace?.permissions.write !== false}
              initialEngagementId={discoveryEntry?.id} createNew={discoveryEntry?.createNew}
              onOpen={openWorkflow} onBusyChange={setBusy} onUnsavedChange={updateDiscoveryUnsaved}
              onManageAccess={() => void changeView("workspaces")} />}
            {view === "home" && <Home key={`${identity.identity}:${workspace?.organization_id || ""}:${workspace?.team_id || ""}`}
              demo={auth?.mode === "local-demo"} retentionDays={auth?.archive_retention_days ?? 30}
              workspaceName={workspace ? `${workspace.organization_name} / ${workspace.team_name}` : undefined}
              workspace={workspace} initialLibrary={homeLibrary} onWorkspaceSelect={changeWorkspace}
              onManageAccess={() => void changeView("workspaces")}
              canCreate={workspace?.permissions.write !== false}
              onCreate={newWorkflow} onOpen={openWorkflow} onBusyChange={setBusy}
              onDiscover={(id) => {
                setDiscoveryEntry(id ? { id } : { createNew: true });
                setView("discovery"); setConfirmDelete(false); setMessage("");
              }}
              onDeleted={(id) => {
                if (id === sessionId) { forgetPointer(); setSnapshot(null); }
                setMessage("Workflow and all retained decision snapshots deleted.");
              }} />}
            {snapshot && !canWrite && ["intake", "diagnose", "analyze"].includes(view) && <p className="notice">Read-only access: your current team permissions do not allow workflow changes.</p>}
            {view === "intake" && <fieldset disabled={!canWrite || busy} className="min-w-0"><Intake key={intakeEntry} sessionId={sessionId} initialContext={snapshot ? { ...snapshot.enterprise_context, demo_scenario: snapshot.demo_scenario } : undefined}
              initialModel={snapshot?.inference_model}
              modelLocked={Boolean(snapshot && (snapshot.model_locked || snapshot.chat_history.length || snapshot.interview_diagnosis || snapshot.analysis_id || snapshot.trace.length))}
              onSaved={async (id: string, analyzeDocument = false, approvedVersion?: string) => {
                await refreshSession(id);
                if (!analyzeDocument) { setView("diagnose"); return; }
                try {
                  const result = await api.analyze(id, undefined, approvedVersion);
                  await refreshSession(id);
                  setView(result.status === "needs_clarification" ? "diagnose" : "blueprint");
                } catch (error) {
                  setMessage(`Context saved, but analysis did not complete: ${error instanceof Error ? error.message : "Reload saved state before retrying."}`);
                  setView("analyze");
                }
              }}
              onBusyChange={setBusy} onUnsavedChange={updateDocumentUnsaved} onDraftChange={updateEditorUnsaved} /></fieldset>}
            {view === "diagnose" && <fieldset disabled={!canWrite} className="min-w-0"><Diagnose sessionId={sessionId} context={snapshot?.enterprise_context}
              demoMode={runtime?.mode === "demo"}
              hasAnalysis={!!snapshot?.analysis_id}
              initialHistory={snapshot?.chat_history} onRefresh={refreshSession} onBusyChange={setBusy} onUnsavedChange={updateEditorUnsaved} goNext={() => void changeView("analyze")} /></fieldset>}
            {view === "evidence" && <EvidenceRegister sessionId={sessionId} hasAnalysis={!!snapshot?.analysis_id}
              onRefresh={refreshSession} onBusyChange={setBusy} onUnsavedChange={updateEditorUnsaved} />}
            {view === "readiness" && <ImplementationReadiness sessionId={sessionId} hasAnalysis={!!snapshot?.analysis_id}
              onRefresh={refreshSession} onBusyChange={setBusy} onUnsavedChange={updateEditorUnsaved} />}
            {view === "analyze" && <fieldset disabled={!canWrite} className="min-w-0"><Analyze sessionId={sessionId} active initialSnapshot={snapshot}
              onRefresh={refreshSession} onBusyChange={setBusy} goNext={() => void changeView("blueprint")} /></fieldset>}
            {view === "blueprint" && <Blueprint sessionId={sessionId} active canReview={snapshot?.permissions.review === true}
              secureReview={auth?.mode === "oidc"} onRefresh={refreshSession} onBusyChange={setBusy} onUnsavedChange={updateEditorUnsaved} />}
            {view === "portfolio" && <Portfolio />}
          </div>}
        </div>
      </main>
    </div>
  );
}
