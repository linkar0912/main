import { MetaApiError } from "../meta/client";

/** Spread a burst deferred to the same boundary (quiet-hours end, a new rate window). */
const DEFERRAL_JITTER_MS = 60_000;

/**
 * A send that must wait rather than fail: the workspace's quiet hours are
 * active, or the account's own per-hour send window is full. It keeps the
 * retryable-429 contract every existing catch already honours (release the
 * claim, rethrow), but the worker moves the job to the delayed set until
 * `delayMs` has passed instead of spending one of its few BullMQ attempts -
 * a two- or three-attempt budget would otherwise be gone long before an
 * eight-hour quiet window or a one-hour rate window ends.
 */
export class SendDeferredError extends MetaApiError {
  readonly delayMs: number;

  constructor(message: string, delayMs: number, random: () => number = Math.random) {
    super(message, 429, true, true);
    this.name = "SendDeferredError";
    this.delayMs = Math.max(1_000, Math.ceil(delayMs)) + Math.floor(random() * DEFERRAL_JITTER_MS);
  }
}

/** Finds a deferral even when a runner wrapped it (RetryableAutomationError keeps it as `cause`). */
export function findSendDeferral(error: unknown): SendDeferredError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof SendDeferredError) return current;
    current = current instanceof Error ? current.cause : undefined;
  }
  return null;
}
