import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const migrationPath = join(
  root,
  "prisma/migrations/20260904190000_razorpay_billing/migration.sql",
);

describe("billing database contract", () => {
  it("keeps one canonical subscription per workspace", () => {
    expect(schema).toContain("model BillingSubscription");
    expect(schema).toMatch(/model BillingSubscription \{[\s\S]*?workspaceId\s+String\s+@unique/);
    expect(schema).toMatch(/providerSubscriptionId\s+String\?\s+@unique/);
  });

  it("persists checkout attempts and idempotent webhook receipts", () => {
    expect(schema).toContain("model BillingCheckoutAttempt");
    expect(schema).toContain("model BillingWebhookEvent");
    expect(schema).toMatch(/model BillingWebhookEvent \{[\s\S]*?eventId\s+String\s+@unique/);
  });

  it("enables row-level security without browser-facing policies", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain('ALTER TABLE "BillingSubscription" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE "BillingCheckoutAttempt" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE "BillingWebhookEvent" ENABLE ROW LEVEL SECURITY');
    expect(migration).not.toMatch(/CREATE\s+POLICY/i);
  });

  it("ships the exact four launch entitlement definitions", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("'plan_free', 'free', 'Free'");
    expect(migration).toContain("'plan_creator', 'creator', 'Creator'");
    expect(migration).toContain("'plan_growth', 'growth', 'Growth'");
    expect(migration).toContain("'plan_agency', 'agency', 'Agency'");
    expect(migration).toContain("50000");
  });
});
