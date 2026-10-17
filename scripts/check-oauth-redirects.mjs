import { pathToFileURL } from "node:url";

// Cloudflare in front of the app turns away default client agents.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

// Only network failures, timeouts, 429 and 5xx are retried. A wrong redirect
// is a configuration fault and fails at once.
class TransientError extends Error {}

async function defaultWait() {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}

// Host and path only: query strings carry PKCE challenges and OAuth state,
// which never belong in a log.
function where(url) {
  return `${url.host}${url.pathname}`;
}

function samePlace(url, expected) {
  return url.origin === expected.origin && url.pathname === expected.pathname;
}

function parse(raw) {
  try {
    return raw ? new URL(raw) : null;
  } catch {
    return null;
  }
}

// Anonymous GET that never follows the redirect and never sends a cookie.
// Resolves to the Location it redirects to.
function redirectReader(fetchFn, timeoutMs) {
  return async function locationOf(url, expectedStatus) {
    let response;
    try {
      response = await fetchFn(url.toString(), {
        method: "GET",
        headers: { Accept: "text/html", "User-Agent": BROWSER_USER_AGENT },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error?.cause?.code ?? error?.name ?? "network error";
      throw new TransientError(`GET ${where(url)} did not answer (${reason})`);
    }
    await response.body?.cancel().catch(() => {});
    if (response.status === 429 || response.status >= 500) {
      throw new TransientError(`GET ${where(url)} answered HTTP ${response.status}`);
    }
    const isRedirect = response.status >= 300 && response.status < 400;
    if (expectedStatus ? response.status !== expectedStatus : !isRedirect) {
      throw new Error(`GET ${where(url)} expected ${expectedStatus ? `HTTP ${expectedStatus}` : "a redirect"}, received HTTP ${response.status}`);
    }
    const location = response.headers.get("location");
    let target = null;
    try {
      target = location ? new URL(location, url) : null;
    } catch {
      target = null;
    }
    if (!target) throw new Error(`GET ${where(url)} redirected without a readable Location`);
    return target;
  };
}

// Both providers match the return URL exactly: Supabase sends a redirect_to
// that is not on its allow list (one with ?next=, say) to the Site URL, and
// Google refuses a redirect_uri that is not registered.
function requireExact(start, param, raw, expected) {
  if (raw === expected.href) return;
  const received = parse(raw);
  if (received && samePlace(received, expected)) {
    throw new Error(`GET ${where(start)}: ${param} ${where(expected)} must carry no query string`);
  }
  throw new Error(`GET ${where(start)} sent ${param} ${received ? where(received) : "none"}, expected ${where(expected)}`);
}

async function verifyChain(app, supabase, locationOf) {
  const callback = new URL("/auth/oauth/callback", app);

  // (a) Facebook sign-in hands Supabase the bare callback URL.
  const facebookStart = new URL("/api/auth/oauth/facebook", app);
  facebookStart.searchParams.set("next", "/dashboard");
  const authorize = await locationOf(facebookStart, 303);
  const authorizeEndpoint = new URL("/auth/v1/authorize", supabase);
  if (!samePlace(authorize, authorizeEndpoint)) {
    throw new Error(`GET ${where(facebookStart)} redirected to ${where(authorize)}, expected ${where(authorizeEndpoint)}`);
  }
  requireExact(facebookStart, "redirect_to", authorize.searchParams.get("redirect_to"), callback);

  // (b) Supabase accepts it and sends the browser on to Facebook.
  const dialog = await locationOf(authorize);
  if (dialog.host !== "www.facebook.com") {
    throw new Error(`GET ${where(authorize)} redirected to ${where(dialog)}, expected www.facebook.com`);
  }
  const state = dialog.searchParams.get("state");
  if (!state) throw new Error(`GET ${where(authorize)} sent Facebook no state`);

  // (c) Pressing Cancel on Facebook lands on the app's callback, not the
  // Site URL. This is the same request Facebook sends back to Supabase.
  const cancel = new URL("/auth/v1/callback", supabase);
  cancel.searchParams.set("error", "access_denied");
  cancel.searchParams.set("error_description", "release check");
  cancel.searchParams.set("state", state);
  const landing = await locationOf(cancel);
  if (!samePlace(landing, callback)) {
    throw new Error(`GET ${where(cancel)} after Cancel returned to ${where(landing)}, expected ${where(callback)}`);
  }
  if (landing.searchParams.get("error") !== "access_denied") {
    throw new Error(`GET ${where(cancel)} after Cancel reached ${where(callback)} without error=access_denied`);
  }

  // (d) Google sign-in names the app's own callback as redirect_uri.
  const googleStart = new URL("/api/auth/oauth/google/start", app);
  googleStart.searchParams.set("next", "/dashboard");
  const consent = await locationOf(googleStart, 303);
  if (consent.host !== "accounts.google.com") {
    throw new Error(`GET ${where(googleStart)} redirected to ${where(consent)}, expected accounts.google.com`);
  }
  const googleCallback = new URL("/api/auth/oauth/google/callback", app);
  requireExact(googleStart, "redirect_uri", consent.searchParams.get("redirect_uri"), googleCallback);
}

export async function checkOAuthRedirects({
  appUrl,
  supabaseUrl,
  fetch: fetchFn = fetch,
  attempts = 3,
  wait = defaultWait,
  timeoutMs = 10_000,
}) {
  const app = new URL(appUrl);
  const supabase = new URL(supabaseUrl);
  const locationOf = redirectReader(fetchFn, timeoutMs);
  let lastError = new Error("OAuth redirect check did not run");
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // Each attempt starts a fresh chain: a state from a failed attempt may
      // already be spent.
      await verifyChain(app, supabase, locationOf);
      return { ok: true };
    } catch (error) {
      if (!(error instanceof TransientError)) throw error;
      lastError = error;
      if (attempt < attempts) await wait();
    }
  }
  throw lastError;
}

async function main() {
  const appUrl = process.env.APP_URL || "https://app.linkar.in";
  const supabaseUrl = process.env.SUPABASE_URL || "https://pdrqwwhhimhxbcncpikq.supabase.co";
  try {
    await checkOAuthRedirects({ appUrl, supabaseUrl });
    const host = new URL(appUrl).host;
    console.log(`OAuth redirects verified · Facebook sign-in and Cancel return to ${host}/auth/oauth/callback · Google returns to ${host}/api/auth/oauth/google/callback`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
