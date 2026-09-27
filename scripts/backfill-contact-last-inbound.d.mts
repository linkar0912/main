export function backfillContactLastInbound(input: {
  prisma: { $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]> };
  batchSize?: number;
  pauseMs?: number;
  onBatch?: (progress: { batch: number; changed: number; updated: number }) => void;
}): Promise<{ updated: number; batches: number }>;
