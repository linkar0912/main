import { Queue } from "bullmq";
import Redis from "ioredis";
import { getServerEnv } from "./env";
import type { NormalizedEvent } from "./automation/types";

export const WEBHOOK_QUEUE_NAME = "replyconnect-webhooks";

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

export async function enqueueWebhookEvents(events: NormalizedEvent[]): Promise<number> {
  const queue = getWebhookQueue();
  if (!queue) return 0;

  await Promise.all(
    events.map((event) =>
      queue.add("instagram-event", event, {
        jobId: `${event.accountId}:${event.id}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      }),
    ),
  );
  return events.length;
}
