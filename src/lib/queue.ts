import { Queue } from "bullmq";
import Redis from "ioredis";
import { createHash } from "node:crypto";
import { getServerEnv } from "./env";
import type { NormalizedEvent } from "./automation/types";

export const WEBHOOK_QUEUE_NAME = "replyconnect-webhooks";

export function createWebhookJobId(event: NormalizedEvent): string {
  return createHash("sha256").update(`${event.accountId}\0${event.id}`).digest("base64url");
}

const globalForQueue = globalThis as unknown as {
  replyconnectWebhookQueue?: Queue;
  replyconnectWebhookRedis?: Redis;
};

function getWebhookQueue(): Queue | null {
  const redisUrl = getServerEnv().redisUrl;
  if (!redisUrl) return null;
  if (globalForQueue.replyconnectWebhookQueue) return globalForQueue.replyconnectWebhookQueue;

  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(WEBHOOK_QUEUE_NAME, { connection: redis });
  globalForQueue.replyconnectWebhookRedis = redis;
  globalForQueue.replyconnectWebhookQueue = queue;
  return queue;
}

export async function deleteQueuedInstagramEvents(igUserId: string): Promise<void> {
  const queue = getWebhookQueue();
  if (!queue) return;
  const jobs = await queue.getJobs(["waiting", "delayed", "prioritized", "waiting-children", "failed", "completed"]);
  await Promise.all(jobs.filter((job) => job.data?.accountId === igUserId).map((job) => job.remove()));
  const remaining = await queue.getJobs(["waiting", "delayed", "prioritized", "waiting-children", "failed", "completed", "active"]);
  if (remaining.some((job) => job.data?.accountId === igUserId)) {
    throw new Error("Instagram deletion is waiting for an active queue job to finish");
  }
}

export async function enqueueWebhookEvents(events: NormalizedEvent[]): Promise<number> {
  const queue = getWebhookQueue();
  if (!queue) return 0;

  await Promise.all(
    events.map((event) =>
      queue.add("instagram-event", event, {
        jobId: createWebhookJobId(event),
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000, jitter: 0.5 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      }),
    ),
  );
  return events.length;
}
