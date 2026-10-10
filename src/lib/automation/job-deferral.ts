import { DelayedError, type Job } from "bullmq";
import { logger } from "../logger";
import { findSendDeferral } from "./send-deferral";

/**
 * Runs one queue job and turns a SendDeferredError into a BullMQ delay: the
 * job moves to the delayed set until the deferral ends and BullMQ is told,
 * via DelayedError, that this is not a failure - attemptsMade is unchanged,
 * so the job keeps its full retry budget for real provider failures.
 */
export async function runWithSendDeferral<T>(
  job: Pick<Job, "id" | "name" | "moveToDelayed">,
  token: string | undefined,
  run: () => Promise<T>,
  now: () => number = Date.now,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const deferral = findSendDeferral(error);
    if (!deferral || !token) throw error;
    await job.moveToDelayed(now() + deferral.delayMs, token);
    logger.info("Queue job deferred", {
      jobId: job.id ?? "unknown",
      jobName: job.name,
      delayMs: deferral.delayMs,
      reason: deferral.message,
    });
    throw new DelayedError();
  }
}
