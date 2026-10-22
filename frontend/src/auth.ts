import { BrowserCacheLocation, InteractionRequiredAuthError, PublicClientApplication, type AccountInfo, type IPublicClientApplication } from "@azure/msal-browser";
import type { SignInConfig } from "./api";

// Popup sign-in keeps tokens in memory only (MSAL rejects redirects with memory storage) and
// keeps page state such as a pending invite. The popup lands on a blank page MSAL reads the code from.
export const REDIRECT_PATH = "/auth-redirect.html";
let client: IPublicClientApplication | null = null;
let account: AccountInfo | null = null;
let scope = "";

export async function initSignIn(config: SignInConfig) {
  scope = config.scope;
  client ??= await PublicClientApplication.createPublicClientApplication({
    auth: { clientId: config.client_id, authority: config.authority, redirectUri: `${window.location.origin}${REDIRECT_PATH}` },
    cache: { cacheLocation: BrowserCacheLocation.MemoryStorage },
  });
}

/** Opens Microsoft sign-in in a popup and returns an API access token. */
export async function signInWithPopup(): Promise<string> {
  if (!client) throw new Error("Microsoft sign-in is not configured.");
  const result = await client.loginPopup({ scopes: [scope], prompt: "select_account" });
  account = result.account;
  return result.accessToken;
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
