import { afterEach, describe, expect, it, vi } from "vitest";

import { getServerEnv } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A complete, non-placeholder production environment for the boot checks. */
function stubProductionBaseline() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PHASE", "");
  vi.stubEnv("DEMO_MODE", "");
  vi.stubEnv("PLATFORM_OWNER_USER_IDS", "11111111-1111-4111-8111-111111111111");
  vi.stubEnv("AUTH_SESSION_SECRET", "prod-session-secret-at-least-32-chars");
  vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database:6543/postgres?pgbouncer=true");
  vi.stubEnv("DIRECT_URL", "");
  vi.stubEnv("REDIS_URL", "redis://:secret@valkey:6379/0");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", "a".repeat(64));
  vi.stubEnv("FACEBOOK_TOKEN_ENCRYPTION_KEY", "");
  vi.stubEnv("META_APP_ID", "");
  vi.stubEnv("FACEBOOK_APP_ID", "");
  vi.stubEnv("META_VERIFY_TOKEN", "");
  vi.stubEnv("FACEBOOK_VERIFY_TOKEN", "");
  vi.stubEnv("HEALTH_DETAIL_TOKEN", "");
}

describe("production boot checks", () => {
  it("accepts a complete production environment", () => {
    stubProductionBaseline();
    expect(getServerEnv().databaseUrl).toContain("postgresql://");
  });

  it.each([
    ["AUTH_SESSION_SECRET", "replace-with-at-least-32-random-characters"],
    ["SUPABASE_SERVICE_ROLE_KEY", "replace-with-supabase-service-role-key"],
    ["DATABASE_URL", "postgresql://postgres.ref:replace-with-db-password@host:6543/postgres"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://your-project-ref.supabase.co"],
    ["META_APP_SECRET", "replace-with-meta-app-secret"],
  ])("rejects the %s checklist placeholder", (name, value) => {
    stubProductionBaseline();
    vi.stubEnv(name, value);
    expect(() => getServerEnv()).toThrow(`${name} must be set to a non-placeholder value in production`);
  });

  it("requires a 32-character session secret", () => {
    stubProductionBaseline();
    vi.stubEnv("AUTH_SESSION_SECRET", "short-but-not-a-placeholder");
    expect(() => getServerEnv()).toThrow("AUTH_SESSION_SECRET must be at least 32 characters in production");
  });

  it("rejects change-me and short webhook verify tokens for a configured channel", () => {
    stubProductionBaseline();
    vi.stubEnv("META_APP_ID", "1234567890");
    vi.stubEnv("META_VERIFY_TOKEN", "change-me");
    expect(() => getServerEnv()).toThrow("META_VERIFY_TOKEN must be set to a non-placeholder value in production");

    vi.stubEnv("META_VERIFY_TOKEN", "too-short-token");
    expect(() => getServerEnv()).toThrow("META_VERIFY_TOKEN must be at least 32 characters in production");

    vi.stubEnv("META_VERIFY_TOKEN", "m".repeat(32));
    vi.stubEnv("FACEBOOK_APP_ID", "0987654321");
    vi.stubEnv("FACEBOOK_VERIFY_TOKEN", "replace-with-a-long-random-webhook-verify-token");
    expect(() => getServerEnv()).toThrow("FACEBOOK_VERIFY_TOKEN must be set to a non-placeholder value in production");

    vi.stubEnv("FACEBOOK_VERIFY_TOKEN", "f".repeat(32));
    expect(getServerEnv().facebookVerifyToken).toBe("f".repeat(32));
  });

  it("refuses to boot production without its infrastructure instead of falling back to demo mode", () => {
    stubProductionBaseline();
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", "");
    expect(() => getServerEnv()).toThrow("DATABASE_URL, META_TOKEN_ENCRYPTION_KEY must be set in production");
  });

  it("requires the Supabase project in production", () => {
    stubProductionBaseline();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => getServerEnv()).toThrow("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in production");
  });

  it("allows a deliberate demo deployment and the image build to run without infrastructure", () => {
    stubProductionBaseline();
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("DEMO_MODE", "1");
    expect(getServerEnv().databaseUrl).toBeFalsy();

    vi.stubEnv("DEMO_MODE", "");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect(getServerEnv().redisUrl).toBeFalsy();
  });

  it("prefers the server-only Supabase variables over the build-time NEXT_PUBLIC_* copies", () => {
    stubProductionBaseline();
    vi.stubEnv("SUPABASE_URL", "https://runtime.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_runtime");
    expect(getServerEnv()).toMatchObject({
      supabaseUrl: "https://runtime.supabase.co",
      supabasePublishableKey: "sb_publishable_runtime",
    });
  });
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
    stubProductionBaseline();
    vi.stubEnv("PLATFORM_OWNER_USER_IDS", "");

    expect(() => getServerEnv()).toThrow(
      "PLATFORM_OWNER_USER_IDS is required in production",
    );
  });

  it("normalizes platform alert recipients without exposing them to the client", () => {
    vi.stubEnv("PLATFORM_ALERT_EMAILS", " owner@linkar.in,ops@linkar.in,owner@linkar.in ");
    vi.stubEnv("EMAIL_FROM", "Linkar Alerts <alerts@linkar.in>");
    vi.stubEnv("EMAIL_API_KEY", "re_test_key");

    expect(getServerEnv()).toMatchObject({
      platformAlertEmails: ["owner@linkar.in", "ops@linkar.in"],
      emailFrom: "Linkar Alerts <alerts@linkar.in>",
      emailApiKey: "re_test_key",
    });
  });

  it("rejects malformed platform alert recipients", () => {
    vi.stubEnv("PLATFORM_ALERT_EMAILS", "owner@linkar.in,not-an-email");
    expect(() => getServerEnv()).toThrow("PLATFORM_ALERT_EMAILS must contain email addresses");
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
    stubProductionBaseline();
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
