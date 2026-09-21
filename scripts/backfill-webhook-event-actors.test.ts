import { describe, expect, it, vi } from "vitest";

import { backfillWebhookEventActors } from "./backfill-webhook-event-actors.mjs";

function fakePrisma(results: number[]) {
  const queue = [...results];
  const calls: unknown[][] = [];
  const $executeRaw = vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(values);
    return queue.shift() ?? 0;
  });
  return { prisma: { $executeRaw }, calls };
}

describe("backfillWebhookEventActors", () => {
  it("runs batches until a batch changes nothing and reports totals", async () => {
    const { prisma, calls } = fakePrisma([2000, 2000, 37, 0]);
    const progress: number[] = [];

    const result = await backfillWebhookEventActors({
      prisma,
      batchSize: 2000,
      pauseMs: 0,
      onBatch: ({ updated }) => progress.push(updated),
    });

    expect(result).toEqual({ updated: 4037, batches: 3 });
    expect(progress).toEqual([2000, 4000, 4037]);
    expect(calls).toHaveLength(4);
    expect(calls.every((values) => values[0] === 2000)).toBe(true);
  });

  it("is a no-op when nothing needs backfilling", async () => {
    const { prisma } = fakePrisma([0]);
    expect(await backfillWebhookEventActors({ prisma, pauseMs: 0 })).toEqual({ updated: 0, batches: 0 });
  });

  it("rejects an unusable batch size before touching the database", async () => {
    const { prisma } = fakePrisma([1]);
    await expect(backfillWebhookEventActors({ prisma, batchSize: 0 })).rejects.toThrow("invalid_batch_size");
    await expect(backfillWebhookEventActors({ prisma, batchSize: 1.5 })).rejects.toThrow("invalid_batch_size");
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("requires a prisma client", async () => {
    await expect(backfillWebhookEventActors({} as never)).rejects.toThrow("prisma_client_required");
  });
});
