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

describe("token encryption key environment", () => {
  const validKey = "a".repeat(64);

  it("rejects a malformed META_TOKEN_ENCRYPTION_KEY instead of booting with garbage", () => {
    vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", "not-64-hex-chars");
    expect(() => getServerEnv()).toThrow("META_TOKEN_ENCRYPTION_KEY must be 64 hex characters when set");
  });

  it("accepts a valid META_TOKEN_ENCRYPTION_KEY", () => {
    vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", validKey);
    expect(getServerEnv().metaTokenEncryptionKey).toBe(validKey);
  });

  it("rejects a malformed META_TOKEN_ENCRYPTION_KEY even when it's only reached via the Facebook fallback", () => {
    vi.stubEnv("FACEBOOK_TOKEN_ENCRYPTION_KEY", "");
    vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", "not-64-hex-chars");
    expect(() => getServerEnv()).toThrow("META_TOKEN_ENCRYPTION_KEY must be 64 hex characters when set");
  });

  it("falls back to the (valid) Meta key for Facebook when no dedicated key is set", () => {
    vi.stubEnv("FACEBOOK_TOKEN_ENCRYPTION_KEY", "");
    vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", validKey);
    expect(getServerEnv().facebookTokenEncryptionKey).toBe(validKey);
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

describe("Razorpay billing environment", () => {
  const completeBillingEnv = {
    RAZORPAY_KEY_ID: "rzp_test_public",
    RAZORPAY_KEY_SECRET: "key-secret",
    RAZORPAY_WEBHOOK_SECRET: "webhook-secret",
    RAZORPAY_PLAN_CREATOR_MONTHLY_ID: "plan_creator_monthly",
    RAZORPAY_PLAN_CREATOR_ANNUAL_ID: "plan_creator_annual",
    RAZORPAY_PLAN_GROWTH_MONTHLY_ID: "plan_growth_monthly",
    RAZORPAY_PLAN_GROWTH_ANNUAL_ID: "plan_growth_annual",
    RAZORPAY_PLAN_AGENCY_MONTHLY_ID: "plan_agency_monthly",
    RAZORPAY_PLAN_AGENCY_ANNUAL_ID: "plan_agency_annual",
  } as const;

  it("groups complete provider credentials and plan IDs under a server-only boundary", () => {
    for (const [name, value] of Object.entries(completeBillingEnv)) vi.stubEnv(name, value);

    expect(getServerEnv().razorpay).toEqual({
      keyId: "rzp_test_public",
      keySecret: "key-secret",
      webhookSecret: "webhook-secret",
      planIds: {
        creator: { MONTHLY: "plan_creator_monthly", ANNUAL: "plan_creator_annual" },
        growth: { MONTHLY: "plan_growth_monthly", ANNUAL: "plan_growth_annual" },
        agency: { MONTHLY: "plan_agency_monthly", ANNUAL: "plan_agency_annual" },
      },
    });
  });

  it("allows billing to remain entirely disabled in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_OWNER_USER_IDS", "11111111-1111-4111-8111-111111111111");
    for (const name of Object.keys(completeBillingEnv)) vi.stubEnv(name, "");

    expect(getServerEnv().razorpay).toEqual({
      keyId: undefined,
      keySecret: undefined,
      webhookSecret: undefined,
      planIds: { creator: {}, growth: {}, agency: {} },
    });
  });

  it("rejects a partially configured production billing environment", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_OWNER_USER_IDS", "11111111-1111-4111-8111-111111111111");
    for (const [name, value] of Object.entries(completeBillingEnv)) vi.stubEnv(name, value);
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");

    expect(() => getServerEnv()).toThrow(
      "RAZORPAY billing configuration must be complete in production",
    );
  });
});
