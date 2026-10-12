import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Shape checks for the Round 9 contact migrations. They run against
// production data, so what they must and must not do is pinned here.

const read = (name: string) => readFile(`prisma/migrations/${name}/migration.sql`, "utf8");
const statements = (sql: string) => sql.replace(/--[^\n]*/g, "").replace(/\$\$[\s\S]*?\$\$/g, "$$$$").split(";").map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);

describe("20261012130000_contact_last_message_direction", () => {
  const name = "20261012130000_contact_last_message_direction";

  it("only adds nullable columns and a NOT VALID check, so no table rewrite or scan", async () => {
    const sql = await read(name);
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "lastOutboundAt" TIMESTAMP(3)');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "lastMessageDirection" TEXT');
    expect(sql).not.toMatch(/NOT NULL DEFAULT|DROP COLUMN|DROP TABLE|ALTER COLUMN/i);
    expect(sql).toMatch(/CHECK \("lastMessageDirection" IS NULL OR "lastMessageDirection" IN \('INBOUND', 'OUTBOUND'\)\) NOT VALID/);
  });

  it("sets the direction on every inbound message, and an older event never wins", async () => {
    const sql = await read(name);
    const inbound = /FUNCTION public\.linkar_contact_inbound_from_event\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)?.[1] ?? "";
    expect(inbound).toContain(`"lastMessageDirection" = CASE`);
    expect(inbound).toContain(`WHEN "lastOutboundAt" IS NOT NULL AND "lastOutboundAt" > NEW."receivedAt" THEN 'OUTBOUND'`);
    expect(inbound).toContain(`("lastInboundAt" IS NULL OR "lastInboundAt" <= NEW."receivedAt")`);
    // The insert trigger itself is unchanged (CREATE OR REPLACE of its function only).
    expect(sql).not.toContain('CREATE TRIGGER "WebhookEvent_contact_last_inbound"');
  });

  it("sets it on every sent message - manual and automated - but not lead emails or webhooks", async () => {
    const sql = await read(name);
    expect(sql).toMatch(/CREATE TRIGGER "OutboundDelivery_contact_last_outbound"\s+AFTER UPDATE OF "state" ON "OutboundDelivery"/);
    expect(sql).toContain(`NEW."state" = 'SENT'`);
    expect(sql).toContain(`OLD."state" IS DISTINCT FROM 'SENT'`);
    expect(sql).toContain(`NEW."kind" NOT IN ('LEAD_EMAIL', 'LEAD_WEBHOOK')`);
    const outbound = /FUNCTION public\.linkar_contact_outbound_from_delivery\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)?.[1] ?? "";
    expect(outbound).toContain(`WHEN "lastInboundAt" IS NOT NULL AND "lastInboundAt" > sent_at THEN 'INBOUND'`);
    expect(outbound).toContain(`("lastOutboundAt" IS NULL OR "lastOutboundAt" <= sent_at)`);
    expect(sql).toMatch(/SET search_path = ''/);
  });

  it("backfills from the delivery ledger, then derives the direction from the later timestamp", async () => {
    const parts = statements(await read(name));
    const backfill = parts.filter((part) => part.startsWith("UPDATE"));
    expect(backfill).toHaveLength(2);
    expect(backfill[0]).toContain(`MAX(COALESCE("sentAt", "updatedAt")) AS "lastSentAt" FROM "OutboundDelivery" WHERE "state" = 'SENT'`);
    expect(backfill[0]).toContain(`GROUP BY "workspaceId", "instagramAccountId", "recipientId"`);
    expect(backfill[0]).toContain(`c."igScopedUserId" = d."recipientId"`);
    expect(backfill[1]).toContain(`WHEN "lastOutboundAt" IS NOT NULL AND ("lastInboundAt" IS NULL OR "lastOutboundAt" >= "lastInboundAt") THEN 'OUTBOUND' ELSE 'INBOUND'`);
    expect(backfill[1]).toContain(`WHERE "lastMessageDirection" IS NULL`);
  });
});

describe("20261012130100_contact_email_capture_attribution", () => {
  it("adds nullable attribution columns and backfills only from data that names the automation", async () => {
    const sql = await read("20261012130100_contact_email_capture_attribution");
    for (const column of ['"emailRequestedAt" TIMESTAMP(3)', '"emailRequestedBy" TEXT', '"emailCapturedAt" TIMESTAMP(3)', '"emailCapturedBy" TEXT']) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
    const updates = statements(sql).filter((part) => part.startsWith("UPDATE"));
    expect(updates).toHaveLength(3);
    expect(updates[0]).toContain(`"emailRequestedBy" = "awaitingAutomationId"`);
    expect(updates[1]).toContain(`"state" = 'AWAITING_FIELD'`);
    expect(updates[2]).toContain(`"kind" IN ('LEAD_EMAIL', 'LEAD_WEBHOOK')`);
    // Never overwrites an attribution that is already there.
    for (const update of updates) expect(update).toMatch(/"email(Requested|Captured)At" IS NULL/);
  });

  it("builds each index concurrently, alone in its migration", async () => {
    for (const [name, index] of [
      ["20261012130200_contact_email_requested_index", '"AutomationContact_emailRequestedBy_idx"'],
      ["20261012130300_contact_email_captured_index", '"AutomationContact_emailCapturedBy_idx"'],
    ]) {
      const parts = statements(await read(name));
      expect(parts).toHaveLength(1);
      expect(parts[0]).toContain(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${index}`);
    }
  });
});
