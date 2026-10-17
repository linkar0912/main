import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REQUIRED_FACEBOOK_PERMISSIONS } from "@/src/lib/facebook/oauth";

const mocks = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  checkValidatedSession: vi.fn(),
  getMemberRole: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ checkValidatedSession: mocks.checkValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({ getMemberRole: mocks.getMemberRole }) }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.cookieJar.has(name) ? { name, value: mocks.cookieJar.get(name) } : undefined),
  }),
}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({
  appUrl: "https://app.linkar.in",
  authSessionSecret: "test-secret-at-least-32-characters",
  facebookAppId: "facebook-app",
  facebookAppSecret: "facebook-app-secret",
  facebookRedirectUri: "https://app.linkar.in/api/facebook/oauth/callback",
  facebookApiVersion: "v25.0",
  facebookScopes: ["pages_show_list"],
  facebookTokenEncryptionKey: "a".repeat(64),
}) }));

const SECRET = "test-secret-at-least-32-characters";
const SESSION = { userId: "u1", email: "owner@example.com", workspaceId: "w1" };

const { GET } = await import("./route");

type GraphAnswer = { status: number; body: unknown } | "timeout";

/**
 * Graph as the real helpers in src/lib/facebook/oauth.ts see it. Each test
 * overrides one endpoint; everything else answers like a healthy connect.
 */
function stubGraph(overrides: Partial<Record<"exchange" | "permissions" | "me" | "accounts", GraphAnswer>> = {}) {
  const answers: Record<"exchange" | "permissions" | "me" | "accounts", GraphAnswer> = {
    exchange: { status: 200, body: { access_token: "facebook-user-token", expires_in: 5_184_000 } },
    permissions: { status: 200, body: { data: REQUIRED_FACEBOOK_PERMISSIONS.map((permission) => ({ permission, status: "granted" })) } },
    me: { status: 200, body: { id: "facebook_user_1" } },
    accounts: { status: 200, body: { data: [{ id: "page_1", name: "Linkar Page", access_token: "page-token" }] } },
    ...overrides,
  };
  const fetchStub = vi.fn(async (input: string | URL | Request) => {
    const { pathname } = new URL(input instanceof Request ? input.url : input);
    const endpoint = pathname.endsWith("/oauth/access_token") ? "exchange"
      : pathname.endsWith("/me/permissions") ? "permissions"
        : pathname.endsWith("/me/accounts") ? "accounts"
          : pathname.endsWith("/me") ? "me"
            : null;
    if (!endpoint) throw new Error(`unexpected Graph call ${pathname}`);
    const answer = answers[endpoint];
    if (answer === "timeout") throw new DOMException("The operation timed out.", "TimeoutError");
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

function signedState(fields: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify({ expiresAt: Date.now() + 600_000, nonce: "0".repeat(32), ...fields })).toString("base64url");
  return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
}

function callback(query: string): Request {
  return new Request(`https://app.linkar.in/api/facebook/oauth/callback${query}`);
}

function returningWithCode(fields: Record<string, unknown> = { workspaceId: "w1", userId: "u1" }): Request {
  const state = signedState(fields);
  mocks.cookieJar.set("linkar_facebook_oauth_state", state);
  return callback(`?code=facebook-code&state=${encodeURIComponent(state)}`);
}

function deletesStateCookie(response: Response): boolean {
  return response.headers.getSetCookie().some((cookie) => cookie.startsWith("linkar_facebook_oauth_state=;"));
}

describe("GET /api/facebook/oauth/callback", () => {
  beforeEach(() => {
    mocks.cookieJar.clear();
    mocks.checkValidatedSession.mockReset().mockResolvedValue({ session: SESSION, authUnavailable: false });
    mocks.getMemberRole.mockReset().mockResolvedValue("OWNER");
  });

  it.each([
    ["nobody is signed in", { session: null, authUnavailable: false }, { workspaceId: "w1", userId: "u1" }],
    ["a different person is signed in", { session: { ...SESSION, userId: "u2", email: "someone@example.com" }, authUnavailable: false }, { workspaceId: "w1", userId: "u1" }],
    ["the signed-in person is now in another workspace", { session: { ...SESSION, workspaceId: "w2" }, authUnavailable: false }, { workspaceId: "w1", userId: "u1" }],
    ["the state names no person (signed before this release)", { session: SESSION, authUnavailable: false }, { workspaceId: "w1" }],
  ])("refuses to finish when %s, before exchanging the code", async (_case, check, stateFields) => {
    const graph = stubGraph();
    mocks.checkValidatedSession.mockResolvedValue(check);

    const response = await GET(returningWithCode(stateFields));

    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?facebook=invalid-state");
    expect(graph).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith("linkar_facebook_page_selection=") && !cookie.startsWith("linkar_facebook_page_selection=;"))).toBe(false);
    expect(deletesStateCookie(response)).toBe(true);
  });

  it("refuses a plain member before exchanging the code", async () => {
    const graph = stubGraph();
    mocks.getMemberRole.mockResolvedValue("MEMBER");

    const response = await GET(returningWithCode());

    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?facebook=forbidden");
    expect(mocks.getMemberRole).toHaveBeenCalledWith("w1", "owner@example.com");
    expect(graph).not.toHaveBeenCalled();
    expect(deletesStateCookie(response)).toBe(true);
  });

  it("says Linkar is briefly unavailable when Supabase Auth could not answer", async () => {
    const graph = stubGraph();
    mocks.checkValidatedSession.mockResolvedValue({ session: null, authUnavailable: true });

    const response = await GET(returningWithCode());

    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?facebook=unavailable");
    expect(graph).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers the Page picker after a healthy connect", async () => {
    stubGraph();

    const response = await GET(returningWithCode());

    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?facebook=select-page");
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith("linkar_facebook_page_selection=") && !cookie.startsWith("linkar_facebook_page_selection=;"))).toBe(true);
    expect(deletesStateCookie(response)).toBe(true);
  });

  it.each([
    ["Graph answers 500 to the Page listing", { accounts: { status: 500, body: { error: { message: "An unknown error has occurred." } } } }],
    ["Graph rate-limits the permission check", { permissions: { status: 429, body: { error: { message: "(#4) Application request limit reached" } } } }],
    ["the Page listing times out", { accounts: "timeout" as const }],
    ["Graph answers 500 when asked who the person is", { me: { status: 500, body: { error: { message: "An unknown error has occurred." } } } }],
  ])("reports page-listing, not token-exchange, when %s after a good exchange", async (_case, overrides) => {
    stubGraph(overrides);

    const response = await GET(returningWithCode());

    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?facebook=page-listing");
    expect(deletesStateCookie(response)).toBe(true);
  });

  it("still reports token-exchange when the code exchange itself fails", async () => {
    stubGraph({ exchange: { status: 400, body: { error: { message: "This authorization code has expired." } } } });

    const response = await GET(returningWithCode());

    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?facebook=token-exchange");
  });

  it("still reports token-exchange when the code exchange times out", async () => {
    stubGraph({ exchange: "timeout" });

    const response = await GET(returningWithCode());

    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?facebook=token-exchange");
  });

  it("still reports missing-permissions when a required permission was declined", async () => {
    stubGraph({ permissions: { status: 200, body: { data: [{ permission: "pages_show_list", status: "granted" }] } } });

    const response = await GET(returningWithCode());

    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?facebook=missing-permissions");
  });

  it("deletes the state cookie when the person cancels or Meta refuses", async () => {
    const fetchStub = stubGraph();
    mocks.cookieJar.set("linkar_facebook_oauth_state", signedState({ workspaceId: "w1", userId: "u1" }));

    const cancelled = await GET(callback("?error=access_denied&error_reason=user_denied"));
    expect(cancelled.headers.get("location")).toBe("https://app.linkar.in/settings?facebook=cancelled");
    expect(deletesStateCookie(cancelled)).toBe(true);

    const denied = await GET(callback("?error=invalid_scope"));
    expect(denied.headers.get("location")).toBe("https://app.linkar.in/settings?facebook=denied");
    expect(deletesStateCookie(denied)).toBe(true);
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
