import { describe, expect, it, vi } from "vitest";

import { backfillContactLastInbound } from "./backfill-contact-last-inbound.mjs";

type Batch = { scanned: number; lastId: string | null; changed: number };

function fakePrisma(batches: Batch[]) {
  const queue = [...batches];
  const calls: unknown[][] = [];
  const $queryRaw = vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(values);
    return [queue.shift() ?? { scanned: 0, lastId: null, changed: 0 }];
  });
  return { prisma: { $queryRaw }, calls };
}

describe("backfillContactLastInbound", () => {
  it("walks contacts by id until a short batch and reports totals", async () => {
    const { prisma, calls } = fakePrisma([
      { scanned: 2, lastId: "contact_b", changed: 1 },
      { scanned: 2, lastId: "contact_d", changed: 0 },
      { scanned: 1, lastId: "contact_e", changed: 1 },
    ]);
    const progress: number[] = [];

    const result = await backfillContactLastInbound({
      prisma,
      batchSize: 2,
      pauseMs: 0,
      onBatch: ({ updated }) => progress.push(updated),
    });

    expect(result).toEqual({ updated: 2, batches: 3 });
    expect(progress).toEqual([1, 1, 2]);
    // Cursor advances past contacts without messages instead of re-reading them.
    expect(calls.map((values) => values[0])).toEqual(["", "contact_b", "contact_d"]);
  });

  it("is a no-op when every contact is already filled", async () => {
    const { prisma, calls } = fakePrisma([{ scanned: 0, lastId: null, changed: 0 }]);
    expect(await backfillContactLastInbound({ prisma, pauseMs: 0 })).toEqual({ updated: 0, batches: 0 });
    expect(calls).toHaveLength(1);
  });

  it("rejects an unusable batch size before touching the database", async () => {
    const { prisma, calls } = fakePrisma([]);
    await expect(backfillContactLastInbound({ prisma, batchSize: 0 })).rejects.toThrow("invalid_batch_size");
    expect(calls).toHaveLength(0);
  });
});
