import { describe, expect, it } from "vitest";
import {
  createOwnerSessionToken,
  hashOwnerPassword,
  readOwnerSession,
  verifyOwnerPassword,
  getRequestOrigin,
  safeNextPath,
  createLoginAttemptLimiter,
} from "./session";

describe("owner authentication", () => {
  it("accepts the configured password and rejects a different password", () => {
    const passwordHash = hashOwnerPassword("correct horse battery staple", "00112233445566778899aabbccddeeff");

    expect(verifyOwnerPassword("correct horse battery staple", passwordHash)).toBe(true);
    expect(verifyOwnerPassword("wrong password", passwordHash)).toBe(false);
  });

  it("returns the workspace carried by a valid signed session", () => {
    const token = createOwnerSessionToken(
      { email: "owner@example.com", workspaceId: "workspace_owner" },
      "session-secret-with-at-least-32-characters",
      new Date("2026-08-20T10:00:00.000Z"),
    );

    expect(
      readOwnerSession(
        token,
        "session-secret-with-at-least-32-characters",
        new Date("2026-08-20T11:00:00.000Z"),
      ),
    ).toEqual({ email: "owner@example.com", workspaceId: "workspace_owner" });
  });

  it("rejects expired and forged sessions", () => {
    const secret = "session-secret-with-at-least-32-characters";
    const token = createOwnerSessionToken(
      { email: "owner@example.com", workspaceId: "workspace_owner" },
      secret,
      new Date("2026-08-20T10:00:00.000Z"),
    );

    expect(readOwnerSession(token, secret, new Date("2026-08-21T10:00:01.000Z"))).toBeNull();
    expect(readOwnerSession(`${token.slice(0, -1)}x`, secret, new Date("2026-08-20T11:00:00.000Z"))).toBeNull();
  });

  it("preserves the browser-facing origin behind a proxy", () => {
    const request = new Request("http://internal-web:3000/api/auth/login", {
      headers: { host: "reply.example.com", "x-forwarded-proto": "https" },
    });

    expect(getRequestOrigin(request)).toBe("https://reply.example.com");
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
