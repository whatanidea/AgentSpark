import { BrowserCacheLocation, InteractionRequiredAuthError, PublicClientApplication, type AccountInfo, type IPublicClientApplication } from "@azure/msal-browser";
import type { SignInConfig } from "./api";

// Tokens stay in memory; only MSAL's short-lived redirect state (PKCE verifier) uses sessionStorage.
const PENDING_INVITE = "agentspark.pendingInvite";
let client: IPublicClientApplication | null = null;
let account: AccountInfo | null = null;
let scope = "";

export type RedirectOutcome = { token: string; invite: string } | null;

/** Initialises MSAL and completes a sign-in redirect if this page load is returning from one. */
export async function initSignIn(config: SignInConfig): Promise<RedirectOutcome> {
  scope = config.scope;
  client = await PublicClientApplication.createPublicClientApplication({
    auth: { clientId: config.client_id, authority: config.authority, redirectUri: `${window.location.origin}/`,
      navigateToLoginRequestUrl: false },
    cache: { cacheLocation: BrowserCacheLocation.MemoryStorage, temporaryCacheLocation: BrowserCacheLocation.SessionStorage },
  });
  const result = await client.handleRedirectPromise();
  if (!result?.accessToken) return null;
  account = result.account;
  let invite = "";
  try { invite = sessionStorage.getItem(PENDING_INVITE) || ""; sessionStorage.removeItem(PENDING_INVITE); } catch {}
  window.history.replaceState(null, "", "/home");
  return { token: result.accessToken, invite };
}

/** Sends the browser to Microsoft sign-in; an unaccepted invite code survives the round trip in this tab only. */
export async function startSignIn(pendingInvite: string) {
  if (!client) throw new Error("Microsoft sign-in is not configured.");
  try { if (pendingInvite) sessionStorage.setItem(PENDING_INVITE, pendingInvite); } catch {}
  await client.loginRedirect({ scopes: [scope], prompt: "select_account" });
}

/** Returns a fresh access token for the signed-in account, or "" when interaction is required. */
export async function currentToken(): Promise<string> {
  if (!client || !account) return "";
  try {
    return (await client.acquireTokenSilent({ scopes: [scope], account })).accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) return "";
    throw e;
  }
}

export function signOutLocally() { account = null; }
