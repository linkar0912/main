import type { AutomationRepository } from "../repository";

export type DeliveryTimingObserver = {
  providerStarted(): void;
  /** `sent` is false when the provider call failed. */
  providerFinished(durationMs: number, sent?: boolean): void;
};

export type DeliveryTimingSnapshot = {
  queueWaitMs: number;
  preProviderMs: number;
  providerMs: number;
  totalMs: number;
  providerCalls: number;
};

/**
 * The full per-event breakdown the worker logs once per realtime job (see
 * "Realtime automation timing"). No identifiers or message content - only
 * durations and counts - so it is safe to keep at info level.
 */
export type RealtimeTimingSnapshot = DeliveryTimingSnapshot & {
  /** Webhook arrival to the job being enqueued (body read, signature, parse, Redis). */
  receivedToEnqueuedMs?: number;
  /** Webhook arrival to Meta accepting the first message - what the person waits for. */
  firstReplyMs?: number;
  /** Wall time with at least one database call in flight. */
  databaseMs: number;
  databaseCalls: number;
  /** Times the job went from no database call in flight to one: serial database rounds. */
  databaseRounds: number;
};

function duration(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function createDeliveryTiming(
  ingestedAt: number,
  now: () => number = () => Date.now(),
  receivedAt?: number,
): DeliveryTimingObserver & {
  workerStarted(): void;
  databaseStarted(): void;
  databaseFinished(): void;
  snapshot(): DeliveryTimingSnapshot;
  realtimeSnapshot(): RealtimeTimingSnapshot;
} {
  let workerStartedAt: number | undefined;
  let firstProviderStartedAt: number | undefined;
  let firstSentAt: number | undefined;
  let providerMs = 0;
  let providerCalls = 0;
  let databaseInFlight = 0;
  let databaseSince = 0;
  let databaseMs = 0;
  let databaseCalls = 0;
  let databaseRounds = 0;

  function snapshot(): DeliveryTimingSnapshot {
    const finishedAt = now();
    const startedAt = workerStartedAt ?? finishedAt;
    return {
      queueWaitMs: duration(startedAt - ingestedAt),
      preProviderMs: duration((firstProviderStartedAt ?? startedAt) - startedAt),
      providerMs: duration(providerMs),
      totalMs: duration(finishedAt - ingestedAt),
      providerCalls,
    };
  }

  return {
    workerStarted() {
      workerStartedAt ??= now();
    },
    providerStarted() {
      firstProviderStartedAt ??= now();
    },
    providerFinished(elapsedMs, sent) {
      providerMs += duration(elapsedMs);
      providerCalls += 1;
      if (sent) firstSentAt ??= now();
    },
    databaseStarted() {
      databaseCalls += 1;
      if (databaseInFlight === 0) {
        databaseRounds += 1;
        databaseSince = now();
      }
      databaseInFlight += 1;
    },
    databaseFinished() {
      if (databaseInFlight === 0) return;
      databaseInFlight -= 1;
      if (databaseInFlight === 0) databaseMs += now() - databaseSince;
    },
    snapshot,
    realtimeSnapshot() {
      const base = snapshot();
      const origin = receivedAt ?? ingestedAt;
      return {
        ...base,
        ...(receivedAt !== undefined ? { receivedToEnqueuedMs: duration(ingestedAt - receivedAt) } : {}),
        ...(firstSentAt !== undefined ? { firstReplyMs: duration(firstSentAt - origin) } : {}),
        databaseMs: duration(databaseMs),
        databaseCalls,
        databaseRounds,
      };
    },
  };
}

/** Reads the repository an instrumented wrapper stands in for. */
export const UNDERLYING_REPOSITORY = Symbol("linkar.underlyingRepository");

/** The repository itself, seen through any instrumentRepository wrapper. */
export function underlyingRepository(repository: AutomationRepository): AutomationRepository {
  return (repository as AutomationRepository & { [UNDERLYING_REPOSITORY]?: AutomationRepository })[UNDERLYING_REPOSITORY]
    ?? repository;
}

/**
 * Wraps a repository so every call is reported to `timing` - one instance per
 * job, so concurrent jobs never mix their numbers. Calls pass straight
 * through; only start/finish are observed.
 */
export function instrumentRepository(
  repository: AutomationRepository,
  timing: Pick<ReturnType<typeof createDeliveryTiming>, "databaseStarted" | "databaseFinished">,
): AutomationRepository {
  return new Proxy(repository, {
    get(target, property, receiver) {
      if (property === UNDERLYING_REPOSITORY) return underlyingRepository(target);
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        timing.databaseStarted();
        let result: unknown;
        try {
          result = value.apply(target, args);
        } catch (error) {
          timing.databaseFinished();
          throw error;
        }
        if (result instanceof Promise) {
          return result.finally(() => timing.databaseFinished());
        }
        timing.databaseFinished();
        return result;
      };
    },
  });
}
