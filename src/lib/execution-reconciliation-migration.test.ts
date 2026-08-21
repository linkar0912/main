import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "prisma/migrations/20260821020000_execution_reconciliation/migration.sql",
  "utf8",
);

describe("execution reconciliation migration", () => {
  it("terminally fails historical PROCESSING executions as ambiguous before enabling CLAIMED defaults", () => {
    expect(migration).not.toMatch(
      /ADD COLUMN "dispatchStatus" TEXT NOT NULL DEFAULT 'CLAIMED'/,
    );
    expect(migration).toMatch(
      /UPDATE "AutomationExecution"[\s\S]*SET[\s\S]*"dispatchStatus" = 'DISPATCHING'[\s\S]*"status" = 'FAILED'[\s\S]*WHERE "status" = 'PROCESSING'/,
    );
    expect(migration).toMatch(
      /IF EXISTS[\s\S]*"status" = 'PROCESSING'[\s\S]*RAISE EXCEPTION/,
    );
  });
});
