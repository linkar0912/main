import { Queue, type Job, type JobType } from "bullmq";
import Redis from "ioredis";
import { createHash } from "node:crypto";
import { getServerEnv } from "./env";
import type { NormalizedEvent } from "./automation/types";

export const WEBHOOK_QUEUE_NAME = "replyconnect-webhooks";

// Scanning the whole queue at once (getJobs without bounds) loads every retained
// job into memory; page through instead so data-deletion sweeps stay cheap even
// with thousands of completed/failed jobs retained.
const JOB_SCAN_PAGE_SIZE = 500;

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

async function findJobsByAccount(queue: Queue, igUserId: string, includeActive: boolean): Promise<Job[]> {
  const states: JobType[] = [
    "waiting",
    "delayed",
    "prioritized",
    "waiting-children",
    "failed",
    "completed",
    ...(includeActive ? ["active" as const] : []),
  ];
  const matches: Job[] = [];
  let start = 0;
  for (; ;) {
    const page = await queue.getJobs(states, start, start + JOB_SCAN_PAGE_SIZE - 1);
    for (const job of page) {
      if (job && job.data?.accountId === igUserId) matches.push(job);
    }
    if (page.length < JOB_SCAN_PAGE_SIZE) break;
    start += JOB_SCAN_PAGE_SIZE;
  }
  return matches;
}

export async function deleteQueuedInstagramEvents(igUserId: string): Promise<void> {
  const queue = getWebhookQueue();
  if (!queue) return;
  const removable = await findJobsByAccount(queue, igUserId, false);
  await Promise.all(removable.map((job) => job.remove()));
  const remaining = await findJobsByAccount(queue, igUserId, true);
  if (remaining.length > 0) {
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