export type DeliveryTimingObserver = {
  providerStarted(): void;
  providerFinished(durationMs: number): void;
};

export type DeliveryTimingSnapshot = {
  queueWaitMs: number;
  preProviderMs: number;
  providerMs: number;
  totalMs: number;
  providerCalls: number;
};

function duration(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function createDeliveryTiming(
  ingestedAt: number,
  now: () => number = () => Date.now(),
): DeliveryTimingObserver & {
  workerStarted(): void;
  snapshot(): DeliveryTimingSnapshot;
} {
  let workerStartedAt: number | undefined;
  let firstProviderStartedAt: number | undefined;
  let providerMs = 0;
  let providerCalls = 0;

  return {
    workerStarted() {
      workerStartedAt ??= now();
    },
    providerStarted() {
      firstProviderStartedAt ??= now();
    },
    providerFinished(elapsedMs) {
      providerMs += duration(elapsedMs);
      providerCalls += 1;
    },
    snapshot() {
      const finishedAt = now();
      const startedAt = workerStartedAt ?? finishedAt;
      return {
        queueWaitMs: duration(startedAt - ingestedAt),
        preProviderMs: duration((firstProviderStartedAt ?? startedAt) - startedAt),
        providerMs: duration(providerMs),
        totalMs: duration(finishedAt - ingestedAt),
        providerCalls,
      };
    },
  };
}
