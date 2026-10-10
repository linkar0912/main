import { logger } from "../logger";

type ScheduleOptions = {
  /** Run once right away (default true) or after this delay instead. */
  firstRunDelayMs?: number;
};

/**
 * The worker's periodic sweeps (token refresh, retention, reconciliations,
 * sequences). Tracks every timer and in-flight run so shutdown can stop new
 * runs and wait for the current ones instead of exiting mid-statement. A
 * task never overlaps itself: a tick that finds the previous run still going
 * is skipped.
 */
export function createBackgroundTasks() {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const inFlight = new Set<Promise<void>>();
  const running = new Set<string>();
  let stopped = false;

  const run = (label: string, task: () => Promise<unknown>) => {
    if (stopped || running.has(label)) return;
    running.add(label);
    const promise = (async () => {
      try {
        await task();
      } catch (error) {
        logger.error(`${label} failed`, { error: error instanceof Error ? error.message : String(error) });
      } finally {
        running.delete(label);
      }
    })();
    inFlight.add(promise);
    void promise.finally(() => inFlight.delete(promise));
  };

  return {
    every(label: string, intervalMs: number, task: () => Promise<unknown>, options: ScheduleOptions = {}) {
      if (options.firstRunDelayMs === undefined) run(label, task);
      else {
        const first = setTimeout(() => {
          timers.delete(first);
          run(label, task);
        }, options.firstRunDelayMs);
        first.unref?.();
        timers.add(first);
      }
      const interval = setInterval(() => run(label, task), intervalMs);
      interval.unref?.();
      timers.add(interval);
    },

    /** Stops scheduling and waits (up to `timeoutMs`) for runs already in progress. */
    async stop(timeoutMs: number): Promise<boolean> {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      if (inFlight.size === 0) return true;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const drained = await Promise.race([
        Promise.allSettled([...inFlight]).then(() => true),
        new Promise<boolean>((resolve) => {
          timeout = setTimeout(() => resolve(false), timeoutMs);
        }),
      ]);
      if (timeout) clearTimeout(timeout);
      return drained;
    },
  };
}
