// A GET that follows redirects, which `https.get` does not.
//
// The Coolify deploy script verifies a release by fetching the public site and
// diffing the hashed stylesheet URL before and after the restart. That check was
// unfalsifiable in practice: PUBLIC_APP_DOMAIN is the apex (`linkar.in`), whose
// `/login` answers `307 -> https://app.linkar.in/login`. The old fetch stopped
// at the redirect, so the body never contained a `<link>` and the "asset
// fingerprint did not change" warning fired on every single release - training
// an operator to ignore the one signal that catches a deploy that silently
// didn't take. `/api/health` is not redirected, which is why only the asset
// check was affected.
import http from "node:http";
import https from "node:https";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * The next URL to request, or null when this response is the final one.
 * Relative `Location` values resolve against the URL that produced them.
 */
export function nextRedirectTarget(status, location, currentUrl) {
  if (!REDIRECT_STATUSES.has(status) || !location) return null;
  return new URL(location, currentUrl).href;
}

function requestOnce(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const transport = new URL(url).protocol === "http:" ? http : https;
    // rejectUnauthorized is off to match the deploy script's existing behaviour:
    // the check has to survive a self-signed or mid-issue certificate, because
    // its job is to prove which build is being served, not to audit TLS.
    const request = transport.get(url, { rejectUnauthorized: false, timeout: timeoutMs }, (response) => {
      let body = "";
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        body,
        location: response.headers.location,
      }));
    });
    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy();
      reject(new Error("request timed out"));
    });
  });
}

/**
 * GET `startUrl`, following up to `maxRedirects` hops.
 * Resolves `{ status, body, url }` where `url` is the URL that actually answered.
 * Non-redirect error statuses resolve rather than reject, so callers can report
 * them; only transport failures and redirect loops reject.
 */
export async function fetchFollowingRedirects(startUrl, { maxRedirects = 5, timeoutMs = 15_000 } = {}) {
  let url = startUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const response = await requestOnce(url, timeoutMs);
    const target = nextRedirectTarget(response.status, response.location, url);
    if (!target) return { status: response.status, body: response.body, url };
    url = target;
  }
  throw new Error(`too many redirects (>${maxRedirects}) starting at ${startUrl}`);
}
