import type { ServerEnv } from "../env";

/**
 * Errors raised while exchanging or refreshing Facebook Login tokens. Mirrors
 * `MetaOAuthError` in `../meta/oauth.ts` but lives in its own module so the
 * Instagram path stays untouched.
 */
export class FacebookOAuthError extends Error {
  readonly retryable: boolean;

  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "FacebookOAuthError";
    this.retryable = status === 429 || status >= 500;
  }
}

/** Meta completed sign-in but withheld a scope the product requires. */
export class FacebookPermissionError extends Error {
  constructor(readonly missingPermissions: string[] = []) {
    super(`Meta did not grant the required Facebook permissions${missingPermissions.length ? `: ${missingPermissions.join(", ")}` : ""}`);
    this.name = "FacebookPermissionError";
  }
}

export const REQUIRED_FACEBOOK_PERMISSIONS = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_manage_engagement",
  "pages_read_engagement",
  "pages_read_user_content",
] as const;

type FacebookOAuthConfig = Pick<
  ServerEnv,
  "facebookAppId" | "facebookAppSecret" | "facebookRedirectUri" | "facebookApiVersion" | "facebookScopes"
>;

/**
 * Build the Facebook Login dialog URL. Uses the JS-style dialog (not the
 * deprecated PHP SDK flow) and requests only the scopes the owner configured
 * via FACEBOOK_SCOPES; default scopes are the minimum set needed for comment
 * replies on a Page.
 */
export function buildFacebookAuthorizeUrl(
  state: string,
  config: Pick<FacebookOAuthConfig, "facebookAppId" | "facebookRedirectUri" | "facebookScopes">,
): string {
  if (!config.facebookAppId) throw new Error("Facebook app is not configured");
  const url = new URL("https://www.facebook.com/v18.0/dialog/oauth");
  url.searchParams.set("client_id", config.facebookAppId);
  url.searchParams.set("redirect_uri", config.facebookRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.facebookScopes.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

async function jsonOrThrow(response: Response): Promise<Record<string, unknown>> {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const graphError = typeof payload.error === "object" && payload.error !== null ? payload.error as Record<string, unknown> : {};
    const message = typeof payload.error_message === "string" ? payload.error_message :
      typeof graphError.message === "string" ? graphError.message : `Facebook OAuth failed (${response.status})`;
    throw new FacebookOAuthError(message, response.status);
  }
  return payload;
}

/**
 * Exchange the code Facebook returned for a long-lived user access token. The
 * short-lived token Facebook issues first must be upgraded immediately because
 * it expires in ~1 hour; the long-lived token lasts ~60 days and is what we
 * actually persist (encrypted).
 */
export async function exchangeFacebookCode(
  code: string,
  config: FacebookOAuthConfig,
  fetcher: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresIn?: number }> {
  if (!config.facebookAppId || !config.facebookAppSecret) {
    throw new Error("Facebook app is not configured");
  }
  const shortBody = new URLSearchParams({
    client_id: config.facebookAppId,
    client_secret: config.facebookAppSecret,
    redirect_uri: config.facebookRedirectUri,
    code,
  });
  const shortLived = await jsonOrThrow(
    await fetcher(`https://graph.facebook.com/${config.facebookApiVersion}/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: shortBody,
    }),
  );
  const shortToken = typeof shortLived.access_token === "string" ? shortLived.access_token : "";
  if (!shortToken) throw new Error("Meta did not return a Facebook access token");
  // Upgrade to a long-lived user token. Scopes are inherited from the
  // short-lived token and are enforced server-side on subsequent API calls.
  const longLived = await jsonOrThrow(
    await fetcher(
      `https://graph.facebook.com/${config.facebookApiVersion}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(config.facebookAppId)}&client_secret=${encodeURIComponent(config.facebookAppSecret)}&fb_exchange_token=${encodeURIComponent(shortToken)}`,
    ),
  );
  const longToken = typeof longLived.access_token === "string" ? longLived.access_token : "";
  if (!longToken) throw new Error("Meta did not return a long-lived Facebook access token");
  return {
    accessToken: longToken,
    expiresIn: typeof longLived.expires_in === "number" ? longLived.expires_in : undefined,
  };
}

/** A Page that the authenticated user can act on behalf of. */
export type FacebookPageSummary = {
  id: string;
  name: string;
  /** Page-scoped access token (NOT the user token), used to post public
   * comment replies and manage the Page webhook subscription. */
  accessToken: string;
  /** Optional category for UI grouping. */
  category?: string;
};

/**
 * List the Pages the current user owns/administrates. The user token must
 * carry `pages_show_list` for this call to return anything. Each Page row
 * carries its own Page access token; we persist that (not the user token)
 * because every Page-scoped Graph API call authenticates with the Page token.
 */
export async function listFacebookPages(
  userAccessToken: string,
  apiVersion: string,
  fetcher: typeof fetch = fetch,
): Promise<FacebookPageSummary[]> {
  const url = new URL(`https://graph.facebook.com/${apiVersion}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,category");
  url.searchParams.set("limit", "100");
  const payload = await jsonOrThrow(
    await fetcher(url, { headers: { authorization: `Bearer ${userAccessToken}` } }),
  );
  const data = Array.isArray(payload.data) ? payload.data : [];
  const pages: FacebookPageSummary[] = [];
  for (const entry of data) {
    if (typeof entry !== "object" || entry === null) continue;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.id !== "string" || !candidate.id) continue;
    if (typeof candidate.access_token !== "string" || !candidate.access_token) continue;
    pages.push({
      id: candidate.id,
      name: typeof candidate.name === "string" ? candidate.name : candidate.id,
      accessToken: candidate.access_token,
      ...(typeof candidate.category === "string" ? { category: candidate.category } : {}),
    });
  }
  return pages;
}

export async function validateFacebookPermissions(
  userAccessToken: string,
  apiVersion: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const url = new URL(`https://graph.facebook.com/${apiVersion}/me/permissions`);
  const payload = await jsonOrThrow(await fetcher(url, {
    headers: { authorization: `Bearer ${userAccessToken}` },
  }));
  const granted = new Set(
    (Array.isArray(payload.data) ? payload.data : [])
      .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
      .filter((entry) => entry.status === "granted" && typeof entry.permission === "string")
      .map((entry) => entry.permission as string),
  );
  const missing = REQUIRED_FACEBOOK_PERMISSIONS.filter((permission) => !granted.has(permission));
  if (missing.length > 0) throw new FacebookPermissionError([...missing]);
}

export async function getFacebookUserId(
  userAccessToken: string,
  apiVersion: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${apiVersion}/me`);
  url.searchParams.set("fields", "id");
  const payload = await jsonOrThrow(await fetcher(url, {
    headers: { authorization: `Bearer ${userAccessToken}` },
  }));
  if (typeof payload.id !== "string" || !payload.id) throw new FacebookOAuthError("Meta did not return a Facebook user id", 502);
  return payload.id;
}

/**
 * Subscribe the Page to webhook fields. The Page token is what authenticates
 * the call (not the app token) - this is different from Instagram, where the
 * user token is used. We request only `feed` for v1 (page post comments ride
 * on this field). Returns true on a clean subscription, false on a degraded
 * result so the settings health check can surface it.
 */
export async function subscribeFacebookPageToWebhooks(
  pageId: string,
  pageAccessToken: string,
  apiVersion: string,
  fetcher: typeof fetch = fetch,
): Promise<{ subscribed: boolean; error?: string }> {
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${pageId}/subscribed_apps`);
  url.searchParams.set("subscribed_fields", "feed");
  const payload = await jsonOrThrow(
    await fetcher(url, {
      method: "POST",
      headers: { authorization: `Bearer ${pageAccessToken}` },
    }),
  );
  if (payload.success === true) return { subscribed: true };
  return { subscribed: false, error: "Meta did not confirm the webhook subscription" };
}

export async function readFacebookPageWebhookSubscription(
  pageId: string,
  pageAccessToken: string,
  apiVersion: string,
  appId: string,
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${pageId}/subscribed_apps`);
  url.searchParams.set("fields", "subscribed_fields");
  const payload = await jsonOrThrow(await fetcher(url, {
    headers: { authorization: `Bearer ${pageAccessToken}` },
  }));
  const fields = new Set<string>();
  for (const entry of Array.isArray(payload.data) ? payload.data : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (record.id !== appId) continue;
    const subscribedFields = record.subscribed_fields;
    if (!Array.isArray(subscribedFields)) continue;
    for (const field of subscribedFields) if (typeof field === "string") fields.add(field);
  }
  return [...fields];
}

export async function unsubscribeFacebookPageFromWebhooks(
  pageId: string,
  pageAccessToken: string,
  apiVersion: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${pageId}/subscribed_apps`);
  const payload = await jsonOrThrow(await fetcher(url, {
    method: "DELETE",
    headers: { authorization: `Bearer ${pageAccessToken}` },
  }));
  return payload.success === true;
}
