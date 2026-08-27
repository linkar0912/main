import { describe, expect, it, vi } from "vitest";
import {
  createSessionToken,
  getSessionFromRequest,
  hashPassword,
  readSessionToken,
  verifyPassword,
  safeNextPath,
  createLoginAttemptLimiter,
  sessionCookieName,
  validateSessionState,
} from "./session";

describe("owner authentication", () => {
  it("accepts the configured password and rejects a different password", async () => {
    const passwordHash = await hashPassword("correct horse battery staple", "00112233445566778899aabbccddeeff");

    expect(await verifyPassword("correct horse battery staple", passwordHash)).toBe(true);
    expect(await verifyPassword("wrong password", passwordHash)).toBe(false);
  });

  it("returns the workspace carried by a valid signed session", () => {
    const token = createSessionToken(
      { userId: "user_owner", workspaceId: "workspace_owner" },
      "session-secret-with-at-least-32-characters",
      new Date("2026-08-20T10:00:00.000Z"),
    );

    expect(
      readSessionToken(
        token,
        "session-secret-with-at-least-32-characters",
        new Date("2026-08-20T11:00:00.000Z"),
      ),
    ).toEqual({
      userId: "user_owner",
      workspaceId: "workspace_owner",
      sid: expect.any(String),
      ver: 0,
    });
  });

  it("serializes only public owner claims into the signed session payload", () => {
    const token = createSessionToken(
      {
        userId: "user_owner",
        workspaceId: "workspace_owner",
        passwordHash: "must-not-leak",
        sessionSecret: "must-not-leak",
      } as never,
      "session-secret-with-at-least-32-characters",
      new Date("2026-08-20T10:00:00.000Z"),
    );

    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    expect(payload).toEqual({
      userId: "user_owner",
      workspaceId: "workspace_owner",
      sid: expect.any(String),
      ver: 0,
      expiresAt: 1787306400000,
    });
    expect(payload.passwordHash).toBeUndefined();
    expect(payload.sessionSecret).toBeUndefined();
  });

  it("rejects expired and forged sessions", () => {
    const secret = "session-secret-with-at-least-32-characters";
    const token = createSessionToken(
      { userId: "user_owner", workspaceId: "workspace_owner" },
      secret,
      new Date("2026-08-20T10:00:00.000Z"),
    );

    expect(readSessionToken(token, secret, new Date("2026-08-21T10:00:01.000Z"))).toBeNull();
    expect(readSessionToken(`${token.slice(0, -1)}x`, secret, new Date("2026-08-20T11:00:00.000Z"))).toBeNull();
  });

  it("rejects every non-canonical trailing-character mutation of the signature", () => {
    // The final base64url character carries unused padding bits; mutating it can
    // decode to byte-identical signatures. Verification must compare the canonical
    // encoding, so exactly zero of the 63 altered tokens may verify - regardless of
    // which character the real signature happens to end with.
    const secret = "session-secret-with-at-least-32-characters";
    const token = createSessionToken(
      { userId: "user_owner", workspaceId: "workspace_owner" },
      secret,
      new Date("2026-08-20T10:00:00.000Z"),
    );
    const body = token.slice(0, -1);
    const originalLast = token.at(-1)!;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    const acceptedMutations = [...alphabet]
      .filter((ch) => ch !== originalLast)
      .filter((ch) => readSessionToken(`${body}${ch}`, secret, new Date("2026-08-20T11:00:00.000Z")));

    expect(acceptedMutations).toEqual([]);
  });

  it("uses a host-only secure cookie name in production", () => {
    expect(sessionCookieName("https://reply.example.com")).toBe("__Host-linkar_session");
    expect(sessionCookieName("http://localhost:3000")).toBe("linkar_session");
  });

  it("reads the last duplicate cookie value per RFC 6265", () => {
    // readCookie is module-private; exercise it through the public
    // getSessionFromRequest entry point. The default test secret is the
    // developer fallback used when AUTH_SESSION_SECRET is not set.
    // Issue a token from a recent `now` so it isn't already expired.
    const now = new Date();
    const token = createSessionToken(
      { userId: "user_owner", workspaceId: "workspace_owner" },
      "dev-insecure-session-secret-change-me-32ch",
      now,
    );
    const oldToken = createSessionToken(
      { userId: "user_legacy", workspaceId: "workspace_legacy" },
      "dev-insecure-session-secret-change-me-32ch",
      now,
    );

    const header = `linkar_session=${oldToken}; linkar_session=${token}`;
    const request = new Request("http://localhost/anything", { headers: { cookie: header } });

    const session = getSessionFromRequest(request);
    expect(session).toMatchObject({
      userId: "user_owner",
      workspaceId: "workspace_owner",
    });
  });

  it("rejects external and backslash-based post-login redirects", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("/automations?tab=active")).toBe("/automations?tab=active");
  });

  it("temporarily blocks repeated failed login attempts", () => {
    const limiter = createLoginAttemptLimiter(3, 60_000);
    const startedAt = new Date("2026-08-20T10:00:00.000Z");
    expect(limiter.isAllowed("203.0.113.10", startedAt)).toBe(true);
    limiter.recordFailure("203.0.113.10", startedAt);
    limiter.recordFailure("203.0.113.10", startedAt);
    limiter.recordFailure("203.0.113.10", startedAt);
    expect(limiter.isAllowed("203.0.113.10", startedAt)).toBe(false);
    expect(limiter.isAllowed("203.0.113.10", new Date(startedAt.getTime() + 60_001))).toBe(true);
  });

  it("rejects a signed session after it is revoked or its user token version changes", async () => {
    const session = { userId: "user_owner", workspaceId: "workspace_owner", sid: "session_1", ver: 2 };
    const revokedRepository = {
      isSessionRevoked: async () => true,
      getUserTokenVersion: async () => 2,
    };
    const bumpedRepository = {
      isSessionRevoked: async () => false,
      getUserTokenVersion: async () => 3,
    };

    expect(await validateSessionState(session, revokedRepository)).toBeNull();
    expect(await validateSessionState(session, bumpedRepository)).toBeNull();
  });

  it.each([
    { userId: "user_owner", workspaceId: "workspace_owner", ver: 2 },
    { userId: "user_owner", workspaceId: "workspace_owner", sid: "session_1" },
  ])("rejects a legacy session missing revocation claims", async (session) => {
    const repository = {
      isSessionRevoked: vi.fn(async () => false),
      getUserTokenVersion: vi.fn(async () => 2),
    };

    expect(await validateSessionState(session, repository)).toBeNull();
    expect(repository.isSessionRevoked).not.toHaveBeenCalled();
    expect(repository.getUserTokenVersion).not.toHaveBeenCalled();
  });
});
