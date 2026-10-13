import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, redactLogContext } from "./logger";

describe("logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("never lets caller context overwrite level, message or time", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logger.error("delivery failed", { level: "info", message: "spoofed", time: "never", jobId: "j1" });
    const line = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(line).toMatchObject({ level: "error", message: "delivery failed", jobId: "j1" });
    expect(line.time).not.toBe("never");
  });

  it("redacts credential fields wherever they are nested", () => {
    expect(redactLogContext({
      accessToken: "EAAB-raw",
      nested: { refresh_token: "r1", clientSecret: "s1", headers: { Authorization: "Bearer abc", cookie: "sb=1" } },
      tokenExpiresAt: "2026-10-13T00:00:00.000Z",
      idempotencyKey: "k1",
      emptyToken: "",
    })).toEqual({
      accessToken: "[redacted]",
      nested: { refresh_token: "[redacted]", clientSecret: "[redacted]", headers: { Authorization: "[redacted]", cookie: "[redacted]" } },
      tokenExpiresAt: "2026-10-13T00:00:00.000Z",
      idempotencyKey: "k1",
      emptyToken: "",
    });
  });

  it("scrubs tokens and email addresses out of free text, including error messages", () => {
    const write = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logger.warn("Graph call failed for owner@example.com", {
      error: "GET https://graph.facebook.com/v25.0/me?fields=id&access_token=EAABsbCS1iHgBAKZBZBl0ZCnQ7 returned 400",
      detail: "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.c2lnbmF0dXJlLXZhbHVl",
      cause: new Error("token IGAAbcdefghijklmnopqrstuvwxyz0123 rejected for someone@linkar.in"),
      already: "a***@example.com",
    });
    const raw = String(write.mock.calls[0]?.[0]);
    expect(raw).not.toMatch(/EAAB|IGAAb|eyJhbGci|owner@|someone@/);
    const line = JSON.parse(raw);
    expect(line.message).toBe("Graph call failed for o***@example.com");
    expect(line.error).toContain("access_token=[redacted]");
    expect(line.detail).toBe("Authorization: Bearer [redacted]");
    expect(line.cause).toEqual({ name: "Error", message: "token [redacted] rejected for s***@linkar.in" });
    expect(line.already).toBe("a***@example.com");
  });
});
