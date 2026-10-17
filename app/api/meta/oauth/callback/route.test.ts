import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEntitlementService } from "@/src/lib/entitlements/service";
import { createMemoryEntitlementRepository } from "@/src/lib/entitlements/memory-repository";

const mocks = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  checkValidatedSession: vi.fn(),
  getMemberRole: vi.fn(),
  listConnections: vi.fn(),
  upsertConnection: vi.fn(),
  assertEntitled: vi.fn(),
  exchangeInstagramCode: vi.fn(),
  getOwnProfile: vi.fn(),
  subscribeToWebhooks: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.cookieJar.has(name) ? { name, value: mocks.cookieJar.get(name) } : undefined),
  }),
}));
vi.mock("@/src/lib/auth/session", () => ({
  checkValidatedSession: mocks.checkValidatedSession,
  getValidatedSession: async (...args: unknown[]) => (await mocks.checkValidatedSession(...args)).session,
}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({
  appUrl: "https://app.linkar.in",
  authSessionSecret: "test-secret-at-least-32-characters",
  metaTokenEncryptionKey: "a".repeat(64),
  metaAppId: "meta-app",
  metaAppSecret: "meta-app-secret",
  metaRedirectUri: "https://app.linkar.in/api/meta/oauth/callback",
  metaApiVersion: "v25.0",
}) }));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    getMemberRole: mocks.getMemberRole,
    listConnections: mocks.listConnections,
    upsertConnection: mocks.upsertConnection,
  }),
}));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
}));
vi.mock("@/src/lib/meta/oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/meta/oauth")>()),
  exchangeInstagramCode: mocks.exchangeInstagramCode,
}));
vi.mock("@/src/lib/meta/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/meta/client")>()),
  MetaClient: class {
    getOwnProfile = mocks.getOwnProfile;
    subscribeToWebhooks = mocks.subscribeToWebhooks;
  },
}));
vi.mock("@/src/lib/security/secrets", () => ({ sealSecret: () => "sealed-instagram-token" }));
vi.mock("@/src/lib/meta/profile-picture", () => ({ clearProfilePictureCache: vi.fn() }));

const SECRET = "test-secret-at-least-32-characters";
const IG_USER_ID = "17841400000000001";
const SESSION = { userId: "u1", email: "owner@example.com", workspaceId: "w1" };

const { GET } = await import("./route");

/**
 * A state signed the way oauth-state.ts signs one, built here so each test
 * controls exactly which fields it carries (an older state had no userId).
 */
function signedState(fields: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify({ expiresAt: Date.now() + 600_000, nonce: "0".repeat(32), ...fields })).toString("base64url");
  return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
}

function callback(query: string): Request {
  return new Request(`https://app.linkar.in/api/meta/oauth/callback${query}`);
}

/** A callback carrying a state the browser also holds in its cookie. */
function returningWith(fields: Record<string, unknown> = { workspaceId: "w1", userId: "u1" }): Request {
  const state = signedState(fields);
  mocks.cookieJar.set("linkar_meta_oauth_state", state);
  return callback(`?code=instagram-code&state=${encodeURIComponent(state)}`);
}

function deletesStateCookie(response: Response): boolean {
  return response.headers.getSetCookie().some((cookie) => cookie.startsWith("linkar_meta_oauth_state=;"));
}

describe("GET /api/meta/oauth/callback", () => {
  beforeEach(() => {
    mocks.cookieJar.clear();
    mocks.checkValidatedSession.mockReset().mockResolvedValue({ session: SESSION, authUnavailable: false });
    mocks.getMemberRole.mockReset().mockResolvedValue("OWNER");
    mocks.listConnections.mockReset().mockResolvedValue([]);
    mocks.upsertConnection.mockReset().mockResolvedValue(undefined);
    // The real Free plan rules: one Instagram account.
    mocks.assertEntitled.mockReset().mockImplementation(createEntitlementService(createMemoryEntitlementRepository()).assertEntitled);
    mocks.exchangeInstagramCode.mockReset().mockResolvedValue({ accessToken: "instagram-token", userId: IG_USER_ID, expiresIn: 5_184_000 });
    mocks.getOwnProfile.mockReset().mockResolvedValue({ id: IG_USER_ID, username: "linkar" });
    mocks.subscribeToWebhooks.mockReset().mockResolvedValue({ fields: ["messages"], requested: ["messages"] });
  });

  it("reconnects an account the workspace already has on the Free plan instead of counting it against the limit", async () => {
    mocks.listConnections.mockResolvedValue([
      { id: "ig_row_1", workspaceId: "w1", igUserId: IG_USER_ID, username: "linkar", status: "EXPIRED" },
    ]);

    const response = await GET(returningWith());

    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?meta=connected");
    expect(mocks.upsertConnection).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "w1",
      igUserId: IG_USER_ID,
      status: "CONNECTED",
    }));
    expect(deletesStateCookie(response)).toBe(true);
  });

  it("still refuses a second, different account on the Free plan", async () => {
    mocks.listConnections.mockResolvedValue([
      { id: "ig_row_1", workspaceId: "w1", igUserId: "17841400000000999", username: "other", status: "CONNECTED" },
    ]);

    const response = await GET(returningWith());

    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?meta=limit-reached");
    expect(mocks.upsertConnection).not.toHaveBeenCalled();
  });

  it.each([
    ["nobody is signed in", { session: null, authUnavailable: false }, { workspaceId: "w1", userId: "u1" }],
    ["a different person is signed in", { session: { ...SESSION, userId: "u2", email: "someone@example.com" }, authUnavailable: false }, { workspaceId: "w1", userId: "u1" }],
    ["the signed-in person is now in another workspace", { session: { ...SESSION, workspaceId: "w2" }, authUnavailable: false }, { workspaceId: "w1", userId: "u1" }],
    ["the state names no person (signed before this release)", { session: SESSION, authUnavailable: false }, { workspaceId: "w1" }],
  ])("refuses to finish when %s, before exchanging the code", async (_case, check, stateFields) => {
    mocks.checkValidatedSession.mockResolvedValue(check);

    const response = await GET(returningWith(stateFields));

    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?meta=invalid-state");
    expect(mocks.exchangeInstagramCode).not.toHaveBeenCalled();
    expect(mocks.upsertConnection).not.toHaveBeenCalled();
    expect(deletesStateCookie(response)).toBe(true);
  });

  it("refuses a plain member before exchanging the code", async () => {
    mocks.getMemberRole.mockResolvedValue("MEMBER");

    const response = await GET(returningWith());

    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?meta=forbidden");
    expect(mocks.getMemberRole).toHaveBeenCalledWith("w1", "owner@example.com");
    expect(mocks.exchangeInstagramCode).not.toHaveBeenCalled();
    expect(deletesStateCookie(response)).toBe(true);
  });

  it("says Linkar is briefly unavailable when Supabase Auth could not answer", async () => {
    mocks.checkValidatedSession.mockResolvedValue({ session: null, authUnavailable: true });

    const response = await GET(returningWith());

    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?meta=unavailable");
    expect(mocks.exchangeInstagramCode).not.toHaveBeenCalled();
  });

  it("deletes the state cookie when the person cancels or Meta refuses", async () => {
    mocks.cookieJar.set("linkar_meta_oauth_state", signedState({ workspaceId: "w1", userId: "u1" }));

    const cancelled = await GET(callback("?error=access_denied&error_reason=user_denied"));
    expect(cancelled.headers.get("location")).toBe("https://app.linkar.in/settings?meta=cancelled");
    expect(deletesStateCookie(cancelled)).toBe(true);

    const denied = await GET(callback("?error=invalid_scope"));
    expect(denied.headers.get("location")).toBe("https://app.linkar.in/settings?meta=denied");
    expect(deletesStateCookie(denied)).toBe(true);
    expect(mocks.exchangeInstagramCode).not.toHaveBeenCalled();
  });

  it("lands back in onboarding when the connect started there", async () => {
    mocks.cookieJar.set("linkar_oauth_return", "onboarding");

    const response = await GET(returningWith());

    expect(response.headers.get("location")).toBe("https://app.linkar.in/onboarding?meta=connected");
  });
});
