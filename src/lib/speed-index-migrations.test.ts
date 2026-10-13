import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// The 2026-10-13 read-path indexes run against live production tables, so
// each must stay a single, additive CREATE INDEX CONCURRENTLY.

const read = (name: string) => readFile(`prisma/migrations/${name}/migration.sql`, "utf8");
const statements = (sql: string) => sql.replace(/--[^\n]*/g, "").split(";").map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);

describe("2026-10-13 read-path index migrations", () => {
  it.each([
    [
      "20261013120000_contact_lead_status_last_seen_index",
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationContact_leadStatus_lastSeenAt_idx" ON "AutomationContact"("workspaceId", "leadStatus", "lastSeenAt" DESC, "id")',
    ],
    [
      "20261013120100_outbound_delivery_workspace_state_index",
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "OutboundDelivery_workspaceId_state_updatedAt_idx" ON "OutboundDelivery"("workspaceId", "state", "updatedAt")',
    ],
  ])("%s builds one index concurrently and nothing else", async (name, expected) => {
    expect(statements(await read(name))).toEqual([expected]);
  });

  it("keeps schema.prisma in step with the migrations", async () => {
    const schema = await readFile("prisma/schema.prisma", "utf8");
    expect(schema).toContain('@@index([workspaceId, leadStatus, lastSeenAt(sort: Desc), id], map: "AutomationContact_leadStatus_lastSeenAt_idx")');
    expect(schema).toContain("@@index([workspaceId, state, updatedAt])");
  });
});
