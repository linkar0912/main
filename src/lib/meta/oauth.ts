import type { ServerEnv } from "../env";
import type { MetaTokenResult } from "./types";

type OAuthConfig = Pick<ServerEnv, "metaAppId" | "metaAppSecret" | "metaRedirectUri" | "metaApiVersion" | "metaScopes">;

// Matches MetaClient's default (client.ts) - these fetch calls previously had
// no signal at all, so a stalled api.instagram.com/graph.instagram.com
// response would hang the interactive OAuth callback (and, worse, block the
// sequential token-refresh loop in token-refresh.ts) indefinitely.
const REQUEST_TIMEOUT_MS = 10_000;

export class MetaOAuthError extends Error {
  readonly retryable: boolean;

  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "MetaOAuthError";
    this.retryable = status === 0 || status === 429 || status >= 500;
  }
}

async function fetchWithTimeout(fetcher: typeof fetch, url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetcher(url, { ...init, signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
    throw new MetaOAuthError(timedOut ? "Meta request timed out" : "Meta network request failed", 0);
  }
}

/** Meta completed sign-in but withheld one or more scopes the product requires. */
export class InstagramPermissionError extends Error {
  constructor() {
    super("Meta did not grant the required Instagram permissions");
    this.name = "InstagramPermissionError";
  }
}

export function buildInstagramAuthorizeUrl(
  state: string,
  config: Pick<OAuthConfig, "metaAppId" | "metaRedirectUri" | "metaScopes">,
): string {
  if (!config.metaAppId) throw new Error("Meta app is not configured");
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", config.metaAppId);
  url.searchParams.set("redirect_uri", config.metaRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.metaScopes.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

async function jsonOrThrow(response: Response): Promise<Record<string, unknown>> {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const graphError = typeof payload.error === "object" && payload.error !== null ? payload.error as Record<string, unknown> : {};
    const message = typeof payload.error_message === "string" ? payload.error_message :
      typeof graphError.message === "string" ? graphError.message : `Meta OAuth failed (${response.status})`;
    throw new MetaOAuthError(message, response.status);
  }
  return payload;
}

export async function exchangeInstagramCode(
  code: string,
  config: OAuthConfig,
  fetcher: typeof fetch = fetch,
): Promise<MetaTokenResult> {
  if (!config.metaAppId || !config.metaAppSecret) throw new Error("Meta app is not configured");
  const body = new URLSearchParams({
    client_id: config.metaAppId,
    client_secret: config.metaAppSecret,
    grant_type: "authorization_code",
    redirect_uri: config.metaRedirectUri,
    code,
  });
  const shortLived = await jsonOrThrow(
    await fetchWithTimeout(fetcher, "https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
  const dataEntry = Array.isArray(shortLived.data) && typeof shortLived.data[0] === "object" && shortLived.data[0] !== null
    ? shortLived.data[0] as Record<string, unknown>
    : shortLived;
  const shortToken = typeof dataEntry.access_token === "string" ? dataEntry.access_token : "";
  const userId = typeof dataEntry.user_id === "string" ? dataEntry.user_id :
    typeof dataEntry.user_id === "number" ? String(dataEntry.user_id) : "";
  if (!shortToken || !userId) throw new Error("Meta did not return an Instagram access token");
  if (config.metaScopes.length > 0) {
    const permissions = new Set(
      Array.isArray(dataEntry.permissions)
        ? dataEntry.permissions.filter((permission): permission is string => typeof permission === "string")
        : typeof dataEntry.permissions === "string" ? dataEntry.permissions.split(",").map((permission) => permission.trim()) : [],
    );
    const missing = config.metaScopes.filter((scope) => !permissions.has(scope));
    if (missing.length > 0) throw new InstagramPermissionError();
  }

  const longLivedResponse = await fetchWithTimeout(
    fetcher,
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(config.metaAppSecret)}&access_token=${encodeURIComponent(shortToken)}`,
  );
  const longLived = await jsonOrThrow(longLivedResponse);
  if (typeof longLived.access_token !== "string" || !longLived.access_token) {
    throw new Error("Meta did not return a long-lived Instagram access token");
  }
  return {
    accessToken: longLived.access_token,
    userId,
    expiresIn: typeof longLived.expires_in === "number" ? longLived.expires_in : undefined,
  };
}

export async function refreshInstagramToken(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresIn?: number }> {
  const response = await fetchWithTimeout(
    fetcher,
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`,
  );
  const payload = await jsonOrThrow(response);
  if (typeof payload.access_token !== "string") throw new Error("Meta did not return a refreshed token");
  return {
    accessToken: payload.access_token,
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : undefined,
  };
}
