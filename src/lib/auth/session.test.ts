import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  hashPassword,
  readSessionToken,
  verifyPassword,
  safeNextPath,
  createLoginAttemptLimiter,
  sessionCookieName,
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

  it("uses a host-only secure cookie name in production", () => {
    expect(sessionCookieName("https://reply.example.com")).toBe("__Host-replyconnect_session");
    expect(sessionCookieName("http://localhost:3000")).toBe("replyconnect_session");
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
});
