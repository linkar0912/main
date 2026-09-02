import { createHmac } from "node:crypto";

/**
 * `appsecret_proof` for server-side Graph API calls: an HMAC-SHA256 of the
 * access token, keyed by the app secret, sent alongside the token.
 *
 * Meta recommends it on every call made from a server and *requires* it once
 * "Require App Secret" is enabled under App Settings > Advanced > Security.
 * It proves the caller also holds the app secret, so a token stolen off a
 * client is not enough on its own to act as the app.
 *
 * Facebook Graph (graph.facebook.com) only. Business Login for Instagram
 * (graph.instagram.com) does not document this parameter, so the Instagram
 * client deliberately does not send it.
 */
export function appSecretProof(accessToken: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

/** Adds `appsecret_proof` to a Graph URL when the app secret is configured. */
export function withAppSecretProof(url: URL, accessToken: string, appSecret: string | undefined): URL {
  if (!appSecret) return url;
  url.searchParams.set("appsecret_proof", appSecretProof(accessToken, appSecret));
  return url;
}
