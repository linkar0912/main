import { describe, expect, it, vi } from "vitest";
import { checkOAuthRedirects } from "./check-oauth-redirects.mjs";

const APP = "https://app.linkar.in";
const SUPABASE = "https://pdrqwwhhimhxbcncpikq.supabase.co";
const STATE = "state-value-never-printed";

function redirect(location: string, status = 302) {
  return new Response(null, { status, headers: { location } });
}

// The anonymous redirect chain production answers with once Facebook sign-in
// returns to the app. Each override swaps one hop for a broken one.
function chain(overrides: {
  redirectTo?: string;
  cancelLocation?: string;
  googleRedirectUri?: string;
} = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const where = `${url.origin}${url.pathname}`;
    if (where === `${APP}/api/auth/oauth/facebook`) {
      const authorize = new URL("/auth/v1/authorize", SUPABASE);
      authorize.searchParams.set("provider", "facebook");
      authorize.searchParams.set("redirect_to", overrides.redirectTo ?? `${APP}/auth/oauth/callback`);
      authorize.searchParams.set("scopes", "email public_profile");
      authorize.searchParams.set("code_challenge", "challenge");
      authorize.searchParams.set("code_challenge_method", "s256");
      return redirect(authorize.toString(), 303);
    }
    if (where === `${SUPABASE}/auth/v1/authorize`) {
      return redirect(`https://www.facebook.com/dialog/oauth?client_id=3242988832553468&redirect_uri=${encodeURIComponent(`${SUPABASE}/auth/v1/callback`)}&response_type=code&scope=email+public_profile&state=${STATE}`);
    }
    if (where === `${SUPABASE}/auth/v1/callback`) {
      return redirect(overrides.cancelLocation ?? `${APP}/auth/oauth/callback?error=access_denied&error_description=release+check#error=access_denied&sb=`);
    }
    if (where === `${APP}/api/auth/oauth/google/start`) {
      const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      google.searchParams.set("client_id", "client.apps.googleusercontent.com");
      google.searchParams.set("redirect_uri", overrides.googleRedirectUri ?? `${APP}/api/auth/oauth/google/callback`);
      google.searchParams.set("response_type", "code");
      google.searchParams.set("state", "google-state");
      return redirect(google.toString(), 303);
    }
    return new Response("not found", { status: 404 });
  });
}

const options = (
  fetch: ReturnType<typeof chain>,
  extra: { attempts?: number; wait?: () => Promise<void> } = {},
) => ({
  appUrl: APP,
  supabaseUrl: SUPABASE,
  fetch: fetch as unknown as typeof globalThis.fetch,
  attempts: 1,
  ...extra,
});

describe("release check that OAuth sign-in returns to the app", () => {
  it("passes on the good chain using anonymous, manual-redirect browser GETs", async () => {
    const fetch = chain();
    await expect(checkOAuthRedirects(options(fetch))).resolves.toEqual({ ok: true });

    const urls = fetch.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.map((url) => `${url.host}${url.pathname}`)).toEqual([
      "app.linkar.in/api/auth/oauth/facebook",
      "pdrqwwhhimhxbcncpikq.supabase.co/auth/v1/authorize",
      "pdrqwwhhimhxbcncpikq.supabase.co/auth/v1/callback",
      "app.linkar.in/api/auth/oauth/google/start",
    ]);
    expect(urls[0]!.searchParams.get("next")).toBe("/dashboard");
    expect(urls[1]!.searchParams.get("code_challenge")).toBe("challenge");
    expect(Object.fromEntries(urls[2]!.searchParams)).toEqual({
      error: "access_denied",
      error_description: "release check",
      state: STATE,
    });
    expect(urls[3]!.searchParams.get("next")).toBe("/dashboard");

    for (const [, init] of fetch.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(init.method ?? "GET").toBe("GET");
      expect(init.redirect).toBe("manual");
      const headers = new Headers(init.headers);
      expect(headers.get("user-agent")).toMatch(/^Mozilla\/5\.0 .*Chrome\//);
      expect(headers.has("cookie")).toBe(false);
    }
  });

  it("fails when the cancel callback falls back to the marketing site, without printing the state", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const error = await checkOAuthRedirects(options(
      chain({ cancelLocation: "https://linkar.in?error=access_denied&error_description=release+check#error=access_denied&sb=" }),
      { attempts: 3, wait },
    )).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("linkar.in/");
    expect(message).toContain("app.linkar.in/auth/oauth/callback");
    expect(message).not.toContain(STATE);
    expect(message).not.toContain("?");
    // A wrong redirect is a configuration fault, not a blip: no retries.
    expect(wait).not.toHaveBeenCalled();
  });

  it("fails when redirect_to carries ?next=", async () => {
    await expect(checkOAuthRedirects(options(chain({ redirectTo: `${APP}/auth/oauth/callback?next=%2Fdashboard` }))))
      .rejects.toThrow("redirect_to app.linkar.in/auth/oauth/callback must carry no query string");
  });

  it("fails when the Google redirect_uri differs", async () => {
    await expect(checkOAuthRedirects(options(chain({ googleRedirectUri: "https://linkar.in/api/auth/oauth/google/callback" }))))
      .rejects.toThrow("redirect_uri linkar.in/api/auth/oauth/google/callback, expected app.linkar.in/api/auth/oauth/google/callback");
  });

  it("retries a transient 5xx", async () => {
    const good = chain();
    const fetch = vi.fn(good).mockImplementationOnce(async () => new Response("bad gateway", { status: 502 }));
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(checkOAuthRedirects(options(fetch as unknown as ReturnType<typeof chain>, { attempts: 2, wait })))
      .resolves.toEqual({ ok: true });
    expect(wait).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(5);
  });
});
