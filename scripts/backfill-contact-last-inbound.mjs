import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_PAUSE_MS = 100;
const MAX_BATCHES = 1_000_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fills AutomationContact.lastInboundAt / lastInboundPreview from each contact's
 * latest inbound WebhookEvent, walking contacts by id in small committed batches
 * so a large table never sees one long transaction. Idempotent: it only fills
 * contacts whose lastInboundAt is still NULL, so it never overwrites a value the
 * database triggers have already set. Contacts with no inbound messages stay NULL
 * and are skipped by the id cursor, so the walk always terminates.
 */
export async function backfillContactLastInbound({
  prisma,
  batchSize = DEFAULT_BATCH_SIZE,
  pauseMs = DEFAULT_PAUSE_MS,
  onBatch = () => {},
} = {}) {
  if (!prisma) throw new Error("prisma_client_required");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50_000) throw new Error("invalid_batch_size");

  let updated = 0;
  let batches = 0;
  let after = "";
  for (; batches < MAX_BATCHES; ) {
    const [{ scanned, lastId, changed }] = await prisma.$queryRaw`
      WITH batch AS (
        SELECT id FROM "AutomationContact"
        WHERE "lastInboundAt" IS NULL AND id > ${after}
        ORDER BY id
        LIMIT ${batchSize}
      ), latest AS (
        SELECT c.id, l."receivedAt", l."payload", l."eventType"
        FROM batch b
        JOIN "AutomationContact" c ON c.id = b.id
        CROSS JOIN LATERAL (
          SELECT w."receivedAt", w."payload", w."eventType"
          FROM "WebhookEvent" w
          WHERE w."workspaceId" = c."workspaceId"
            AND w."eventType" IN ('message.received', 'quick_reply.received', 'postback.received', 'story_mention.received')
            AND w."accountId" = c."instagramAccountId"
            AND w."recipientId" = c."igScopedUserId"
          ORDER BY w."receivedAt" DESC, w."id" DESC
          LIMIT 1
        ) l
      ), filled AS (
        UPDATE "AutomationContact" c
        SET "lastInboundAt" = latest."receivedAt",
            "lastInboundPreview" = public.linkar_inbound_preview(latest."payload", latest."eventType")
        FROM latest
        WHERE c.id = latest.id AND c."lastInboundAt" IS NULL
        RETURNING 1
      )
      SELECT (SELECT COUNT(*) FROM batch)::int AS scanned,
             (SELECT MAX(id) FROM batch) AS "lastId",
             (SELECT COUNT(*) FROM filled)::int AS changed`;
    if (scanned === 0) break;
    batches += 1;
    updated += changed;
    after = lastId;
    onBatch({ batch: batches, changed, updated });
    if (scanned < batchSize) break;
    if (pauseMs > 0) await sleep(pauseMs);
  }
  return { updated, batches };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required (use the direct connection)");
  const batchSize = process.env.BACKFILL_BATCH_SIZE ? Number(process.env.BACKFILL_BATCH_SIZE) : DEFAULT_BATCH_SIZE;

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const result = await backfillContactLastInbound({
      prisma,
      batchSize,
      onBatch: ({ batch, changed, updated }) => process.stderr.write(`batch ${batch}: ${changed} rows (${updated} total)\n`),
    });
    const [{ remaining }] = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS remaining FROM "AutomationContact" c
      WHERE c."lastInboundAt" IS NULL AND EXISTS (
        SELECT 1 FROM "WebhookEvent" w
        WHERE w."workspaceId" = c."workspaceId"
          AND w."eventType" IN ('message.received', 'quick_reply.received', 'postback.received', 'story_mention.received')
          AND w."accountId" = c."instagramAccountId"
          AND w."recipientId" = c."igScopedUserId"
      )`;
    process.stdout.write(JSON.stringify({ ...result, remaining }) + "\n");
    if (remaining !== 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "backfill_failed"}\n`);
    process.exitCode = 1;
  });
}
