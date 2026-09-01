import { afterEach, describe, expect, it, vi } from "vitest";

import { getServerEnv } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("platform owner environment", () => {
  it("keeps the owner console on its own production origin", () => {
    vi.stubEnv("ADMIN_URL", "https://admin.linkar.in");
    expect(getServerEnv().adminUrl).toBe("https://admin.linkar.in");
  });
  it("normalizes and deduplicates a comma-separated UUID allowlist", () => {
    vi.stubEnv("PLATFORM_OWNER_USER_IDS", [
      "11111111-1111-4111-8111-111111111111",
      " 22222222-2222-4222-8222-222222222222 ",
      "11111111-1111-4111-8111-111111111111",
    ].join(","));

    expect(getServerEnv().platformOwnerUserIds).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("rejects email addresses and malformed identifiers", () => {
    vi.stubEnv("PLATFORM_OWNER_USER_IDS", "owner@linkar.in,not-a-uuid");

    expect(() => getServerEnv()).toThrow(
      "PLATFORM_OWNER_USER_IDS must contain UUIDs",
    );
  });

  it("fails closed when the production allowlist is empty", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_OWNER_USER_IDS", "");

    expect(() => getServerEnv()).toThrow(
      "PLATFORM_OWNER_USER_IDS is required in production",
    );
  });
});

describe("provider request environment", () => {
  it("defaults provider requests to ten seconds with a safe dispatch lease", () => {
    vi.stubEnv("PROVIDER_REQUEST_TIMEOUT_MS", "");
    vi.stubEnv("DISPATCH_LEASE_MS", "");

    expect(getServerEnv()).toMatchObject({
      providerRequestTimeoutMs: 10_000,
      dispatchLeaseMs: 30_000,
    });
  });

  it("requires a positive provider timeout", () => {
    vi.stubEnv("PROVIDER_REQUEST_TIMEOUT_MS", "0");

    expect(() => getServerEnv()).toThrow("PROVIDER_REQUEST_TIMEOUT_MS must be a positive integer");
  });

  it("keeps the dispatch lease at least five seconds beyond the provider deadline", () => {
    vi.stubEnv("PROVIDER_REQUEST_TIMEOUT_MS", "10000");
    vi.stubEnv("DISPATCH_LEASE_MS", "14999");

    expect(() => getServerEnv()).toThrow(
      "DISPATCH_LEASE_MS must be at least PROVIDER_REQUEST_TIMEOUT_MS + 5000",
    );

    vi.stubEnv("DISPATCH_LEASE_MS", "15000");
    expect(getServerEnv().dispatchLeaseMs).toBe(15_000);
  });
});
