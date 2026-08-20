import type { ServerEnv } from "../env";
import type { MetaTokenResult } from "./types";

type OAuthConfig = Pick<ServerEnv, "metaAppId" | "metaAppSecret" | "metaRedirectUri" | "metaApiVersion" | "metaScopes">;

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
    throw new Error(typeof payload.error_message === "string" ? payload.error_message : `Meta OAuth failed (${response.status})`);
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
    await fetcher("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
  const shortToken = typeof shortLived.access_token === "string" ? shortLived.access_token : "";
  const userId = typeof shortLived.user_id === "string" ? shortLived.user_id : "";
  if (!shortToken || !userId) throw new Error("Meta did not return an Instagram access token");

  const longLivedResponse = await fetcher(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(config.metaAppSecret)}&access_token=${encodeURIComponent(shortToken)}`,
  );
  if (!longLivedResponse.ok) return { accessToken: shortToken, userId };
  const longLived = await longLivedResponse.json().catch(() => ({})) as Record<string, unknown>;
  return {
    accessToken: typeof longLived.access_token === "string" ? longLived.access_token : shortToken,
    userId,
    expiresIn: typeof longLived.expires_in === "number" ? longLived.expires_in : undefined,
  };
}

export async function refreshInstagramToken(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresIn?: number }> {
  const response = await fetcher(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`,
  );
  const payload = await jsonOrThrow(response);
  if (typeof payload.access_token !== "string") throw new Error("Meta did not return a refreshed token");
  return {
    accessToken: payload.access_token,
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : undefined,
  };
}
