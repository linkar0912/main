import { logger } from "./logger";

/** Above this, the app and the database are almost certainly in different regions. */
export const CROSS_REGION_LATENCY_MS = 25;

/**
 * Median round trip of `SELECT 1`. Every realtime send makes several serial
 * queries, so this number times ~10 is roughly what the network alone adds to
 * a comment → DM.
 */
export async function measureDatabaseLatency(
  query: () => Promise<unknown>,
  samples = 5,
): Promise<number> {
  await query(); // warm the pooled connection so the handshake isn't measured
  const timings: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const startedAt = performance.now();
    await query();
    timings.push(performance.now() - startedAt);
  }
  timings.sort((a, b) => a - b);
  return timings[Math.floor(timings.length / 2)] ?? 0;
}

/** Logs the database round trip once at startup and warns when it looks cross-region. */
export async function reportDatabaseLatency(
  processName: string,
  query: () => Promise<unknown>,
): Promise<void> {
  try {
    const medianMs = Math.round(await measureDatabaseLatency(query));
    if (medianMs > CROSS_REGION_LATENCY_MS) {
      logger.warn("Database round trip is slow - the server is probably in a different region than the database", {
        process: processName,
        medianMs,
        thresholdMs: CROSS_REGION_LATENCY_MS,
        runbook: "docs/performance-runbook.md#region-co-location-the-single-biggest-infrastructure-lever",
      });
    } else {
      logger.info("Database round trip", { process: processName, medianMs });
    }
  } catch (error) {
    logger.warn("Database latency probe failed", {
      process: processName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
