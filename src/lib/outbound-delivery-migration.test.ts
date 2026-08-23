import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath =
  "prisma/migrations/20260823200000_outbound_delivery_ledger/migration.sql";

describe("outbound delivery ledger migration", () => {
  it("declares unique delivery keys and atomic quota keys", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain(
      'CREATE UNIQUE INDEX "OutboundDelivery_deliveryKey_key"',
    );
    expect(sql).toContain('PRIMARY KEY ("automationId", "utcDate")');
    expect(sql).toContain('"state" TEXT NOT NULL');
    expect(sql).toContain('"payload" JSONB NOT NULL');
  });

  it("constrains ledger states, kinds, result codes, and quota counts", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain('CHECK ("state" IN (');
    expect(sql).toContain('CHECK ("kind" IN (');
    expect(sql).toContain('CHECK ("resultCode" IS NULL OR "resultCode" IN (');
    expect(sql).toContain('CHECK ("reserved" >= 0)');
  });
});
