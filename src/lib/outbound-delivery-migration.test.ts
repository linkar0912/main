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

describe("outbound delivery kind constraint", () => {
  it("allows every OutboundDeliveryKind the code writes", async () => {
    const { readdir } = await import("node:fs/promises");
    const migrations = (await readdir("prisma/migrations")).filter((name) => /^\d/.test(name)).sort();
    let allowed: string[] = [];
    for (const name of migrations) {
      const sql = await readFile(`prisma/migrations/${name}/migration.sql`, "utf8").catch(() => "");
      const matches = [...sql.matchAll(/"OutboundDelivery_kind_check" CHECK \("kind" IN \(([^)]*)\)\)/g)];
      const last = matches.at(-1);
      if (last) allowed = [...last[1].matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
    }
    const repository = await readFile("src/lib/repository.ts", "utf8");
    const union = /export type OutboundDeliveryKind =([^;]+);/.exec(repository)?.[1] ?? "";
    const kinds = [...union.matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]);

    expect(kinds).toContain("MANUAL_INBOX");
    expect([...allowed].sort()).toEqual([...kinds].sort());
  });
});
