import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const DEFAULT_BATCH_SIZE = 2000;
const DEFAULT_PAUSE_MS = 100;
const MAX_BATCHES = 1_000_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Copies payload.accountId / payload.recipientId into the denormalized
 * WebhookEvent columns in small committed batches, so a large table never sees
 * one long transaction. Idempotent: it only touches rows that still have a value
 * to copy, never overwrites a column that is already set, and matches on the
 * extracted text (not key presence) so a JSON null cannot make it loop forever.
 */
export async function backfillWebhookEventActors({
  prisma,
  batchSize = DEFAULT_BATCH_SIZE,
  pauseMs = DEFAULT_PAUSE_MS,
  onBatch = () => {},
} = {}) {
  if (!prisma) throw new Error("prisma_client_required");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50_000) throw new Error("invalid_batch_size");

  let updated = 0;
  let batches = 0;
  for (; batches < MAX_BATCHES; ) {
    const changed = await prisma.$executeRaw`
      UPDATE "WebhookEvent"
      SET "accountId" = COALESCE("accountId", payload->>'accountId'),
          "recipientId" = COALESCE("recipientId", payload->>'recipientId')
      WHERE id IN (
        SELECT id FROM "WebhookEvent"
        WHERE ("accountId" IS NULL AND payload->>'accountId' IS NOT NULL)
           OR ("recipientId" IS NULL AND payload->>'recipientId' IS NOT NULL)
        LIMIT ${batchSize}
      )`;
    if (changed === 0) break;
    batches += 1;
    updated += changed;
    onBatch({ batch: batches, changed, updated });
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
    const result = await backfillWebhookEventActors({
      prisma,
      batchSize,
      onBatch: ({ batch, changed, updated }) => process.stderr.write(`batch ${batch}: ${changed} rows (${updated} total)\n`),
    });
    const [{ remaining }] = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS remaining FROM "WebhookEvent"
      WHERE ("accountId" IS NULL AND payload->>'accountId' IS NOT NULL)
         OR ("recipientId" IS NULL AND payload->>'recipientId' IS NOT NULL)`;
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
