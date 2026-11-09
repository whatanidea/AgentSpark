import { useEffect, useState } from "react";
import { api, type AuthConfig, type Identity, type InvitePreview, type InviteRedemption } from "../api";
import { Button, Card } from "./ui";
import { AppearanceControl } from "../Appearance";

export default function InviteOnboarding({ code, warning, auth, identity, accountLabel, starting, busy, message,
  onSignIn, onSwitchAccount, onJoined, onCancel, onBusyChange }: {
  code: string; warning: string; auth: AuthConfig | null; identity: Identity | null; accountLabel: string;
  starting: boolean; busy: boolean; message: string; onSignIn: (email: string) => Promise<void>;
  onSwitchAccount: () => void; onJoined: (result: InviteRedemption) => void; onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setPreview(null); setError("");
    api.previewInvite(code).then(result => { if (active) setPreview(result); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not check the invitation. Retry."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [code, attempt]);

  const working = busy || joining || starting || loading;
  return <main className="min-h-screen bg-canvas px-4 py-8 md:py-16">
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3"><a className="text-xl font-bold text-graphite" href="/"
        onClick={event => { event.preventDefault(); if (!working) onCancel(); }}>AgentSpark</a><AppearanceControl /></div>
      <Card>
        <p className="eyebrow mb-3">Your workspace invitation</p>
        <h1 className="text-2xl font-bold break-words">{preview ? `Join ${preview.organization_name}` : "Let's get you connected"}</h1>
        <ol aria-label="Invitation progress" className="flex flex-wrap gap-3 text-xs text-zinc-500 mt-4">
          <li>1. Review invitation</li><li>2. Verify your email</li><li>3. Open your workspace</li>
        </ol>
        {loading && <p role="status" className="mt-5">Checking your invitation...</p>}
        {warning && <p role="status" className="notice notice-warning mt-5">{warning}</p>}
        {auth?.mode === "local-demo" && <p className="notice notice-warning mt-5">Local demo uses one shared identity;
          it does not verify email addresses. Real onboarding requires Entra sign-in.</p>}
        {message && <p role="status" className="notice mt-5">{message}</p>}
        {error && <div role="alert" className="notice border-rose-200 text-rose-800 bg-rose-50 mt-5">{error}</div>}
        {!loading && !preview && <div className="mt-5 space-y-3">
          <p className="text-sm text-zinc-600">Ask the sender for a fresh invitation if this link has expired, been revoked or already been used.</p>
          <Button disabled={working} onClick={() => setAttempt(value => value + 1)}>Check invitation again</Button>
        </div>}
        {preview && <div className="mt-6 space-y-5">
          <div className="rounded border border-line bg-zinc-50 p-4 text-sm space-y-2 break-words">
            <p>Organization: <strong>{preview.organization_name}</strong></p>
            <p>Workspace: <strong>{preview.team_name || "Organization membership only"}</strong></p>
            <p>Organization role: <strong>{preview.role === "admin" ? "Administrator" : "Member"}</strong></p>
            {preview.team_roles.length > 0 && <p>Team roles: <strong>{preview.team_roles.join(", ")}</strong></p>}
            <p className="text-xs text-zinc-500">Expires {new Date(preview.expires_at).toLocaleString()}</p>
          </div>
          {starting ? <p role="status">Loading secure sign-in...</p> : !identity ? <>
            <p className="text-sm text-zinc-600">Use the work email or Gmail address your administrator invited to Entra.
              Microsoft Entra verifies your account or sends an email code where enabled.
              This platform has no public sign-up; your organization's security policies still apply.</p>
            {auth?.sign_in ? <form className="space-y-4" onSubmit={event => {
              event.preventDefault(); if (!working) void onSignIn(email.trim());
            }}>
              <label className="block text-sm">Your email address
                <input type="email" autoComplete="email" required maxLength={254} className="form-control block mt-2"
                  placeholder="you@company.com or you@gmail.com" value={email} disabled={working}
                  onChange={event => setEmail(event.target.value)} />
              </label>
              <Button type="submit" disabled={working || !email.trim()}>{busy ? "Verifying your account..." : "Continue with email"}</Button>
              <p className="text-xs text-zinc-500">A secure sign-in window will open. No Microsoft password is collected by AgentSpark.</p>
            </form> : <p role="alert" className="notice notice-warning">Browser sign-in is unavailable. Ask the administrator to configure Entra sign-in before accepting this invitation.</p>}
          </> : <>
            <p className="text-sm text-zinc-600">{accountLabel ? <>Signed in as <strong className="break-all">{accountLabel}</strong>.</>
              : auth?.mode === "local-demo" ? "The demo identity is shared; no email verification has occurred." : "Your account is verified."}
              {" "}Accepting adds the access shown above to this account. It does not authorize business actions or deployments.</p>
            <div className="flex flex-wrap gap-3">
              <Button disabled={working} onClick={async () => {
                setJoining(true); onBusyChange?.(true); setError("");
                try { onJoined(await api.redeemInvite(code)); }
                catch (e) { setError(e instanceof Error ? e.message : "Could not accept the invitation. Retry."); }
                finally { setJoining(false); onBusyChange?.(false); }
              }}>{joining ? "Opening your workspace..." : "Accept invitation"}</Button>
              {auth?.mode === "oidc" && <Button variant="ghost" disabled={working} onClick={onSwitchAccount}>Use a different account</Button>}
            </div>
          </>}
        </div>}
        <div className="mt-6 border-t border-line pt-4">
          <Button variant="ghost" disabled={working} onClick={onCancel}>Not now</Button>
        </div>
      </Card>
      <p className="text-xs text-zinc-500">Keep invitation links private. A link does not replace verified sign-in.
        No passwords or access tokens are stored in browser storage.</p>
    </div>
  </main>;
}
