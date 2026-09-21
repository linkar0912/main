export function backfillWebhookEventActors(input: {
  prisma: { $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number> };
  batchSize?: number;
  pauseMs?: number;
  onBatch?: (progress: { batch: number; changed: number; updated: number }) => void;
}): Promise<{ updated: number; batches: number }>;
