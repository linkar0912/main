import { Queue, type Job, type JobType } from "bullmq";
import Redis from "ioredis";
import { createHash } from "node:crypto";
import { getServerEnv } from "./env";
import type { NormalizedEvent } from "./automation/types";
import type { FacebookNormalizedEvent } from "./facebook/types";

export const WEBHOOK_QUEUE_NAME = "linkar-webhooks";

export type WebhookQueueCounts = {
  state: "ok" | "not_configured" | "error";
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
};

// Scanning the whole queue at once (getJobs without bounds) loads every retained
// job into memory; page through instead so data-deletion sweeps stay cheap even
// with thousands of completed/failed jobs retained.
const JOB_SCAN_PAGE_SIZE = 500;
export const ADMIN_QUEUE_NAMES = ["webhooks"] as const;
export type AdminQueueName = typeof ADMIN_QUEUE_NAMES[number];

export type AdminQueueSnapshot = {
  name: AdminQueueName;
  configured: boolean;
  paused: boolean | null;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  oldestWaitingAgeMs: number | null;
  lastFailedCode: string | null;
};

export function createWebhookJobId(event: NormalizedEvent): string {
  // BullMQ deduplicates enqueues by jobId, so the id MUST be stable per
  // unique (accountId, event.id). Both come from Meta and are part of the
  // webhook signature: event.id is the Instagram comment/message id which
  // is unique per Meta object, and accountId scopes the dedupe so the same
  // id under a different account does not collide. The hash keeps the id
  // length bounded for Redis key namespacing.
  return createHash("sha256").update(`${event.accountId}\0${event.id}`).digest("base64url");
}

export function createFacebookWebhookJobId(event: FacebookNormalizedEvent): string {
  // Same dedupe contract as the IG jobId: stable per (pageId, event.id). We
  // use pageId instead of accountId because Facebook webhooks are scoped to
  // Page objects, not user accounts.
  return createHash("sha256").update(`${event.pageId}\0${event.id}`).digest("base64url");
}

export type LeadDeliveryJob = {
  deliveryKey: string;
  workspaceId: string;
  kind: "LEAD_EMAIL" | "LEAD_WEBHOOK";
};

export function createLeadDeliveryJobId(deliveryKey: string): string {
  return createHash("sha256").update(deliveryKey).digest("base64url");
}

const globalForQueue = globalThis as unknown as {
  linkarWebhookQueue?: Queue;
  linkarWebhookRedis?: Redis;
};

function getWebhookQueue(): Queue | null {
  const redisUrl = getServerEnv().redisUrl;
  if (!redisUrl) return null;
  if (globalForQueue.linkarWebhookQueue) return globalForQueue.linkarWebhookQueue;

  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(WEBHOOK_QUEUE_NAME, { connection: redis });
  globalForQueue.linkarWebhookRedis = redis;
  globalForQueue.linkarWebhookQueue = queue;
  return queue;
}

function adminQueue(name: string): Queue | null {
  if (!ADMIN_QUEUE_NAMES.includes(name as AdminQueueName)) throw new Error("unknown_queue");
  return getWebhookQueue();
}

function safeFailureCode(reason?: string): string | null {
  if (!reason) return null;
  const candidate = reason.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 64);
  return /^[A-Z][A-Z0-9_]{1,63}$/.test(candidate) ? candidate : "ERROR_RECORDED";
}

export async function getAdminQueueSnapshot(name: AdminQueueName): Promise<AdminQueueSnapshot> {
  const queue = adminQueue(name);
  if (!queue) return { name, configured: false, paused: null, waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0, oldestWaitingAgeMs: null, lastFailedCode: null };
  const [counts, paused, oldest, failed] = await Promise.all([
    queue.getJobCounts("waiting", "active", "delayed", "completed", "failed"),
    queue.isPaused(),
    queue.getJobs(["waiting"], 0, 0, true),
    queue.getJobs(["failed"], 0, 0),
  ]);
  const oldestTimestamp = oldest[0]?.timestamp;
  return { name, configured: true, paused, waiting: counts.waiting ?? 0, active: counts.active ?? 0, delayed: counts.delayed ?? 0, completed: counts.completed ?? 0, failed: counts.failed ?? 0, oldestWaitingAgeMs: oldestTimestamp ? Math.max(0, Date.now() - oldestTimestamp) : null, lastFailedCode: safeFailureCode(failed[0]?.failedReason) };
}

export async function setAdminQueuePaused(name: string, paused: boolean): Promise<{ name: AdminQueueName; paused: boolean }> {
  const queue = adminQueue(name); if (!queue) throw new Error("queue_unavailable");
  if (paused) await queue.pause(); else await queue.resume();
  return { name: name as AdminQueueName, paused };
}

export async function retryAdminQueueJobs(name: string, jobIds: string[]): Promise<{ retried: string[] }> {
  if (jobIds.length < 1 || jobIds.length > 100) throw new Error("invalid_job_batch");
  const queue = adminQueue(name); if (!queue) throw new Error("queue_unavailable"); const jobs = await Promise.all(jobIds.map((id) => queue.getJob(id)));
  if (jobs.some((job) => !job)) throw new Error("job_not_found");
  for (const job of jobs) { if (await job!.getState() !== "failed") throw new Error("job_not_failed"); }
  await Promise.all(jobs.map((job) => job!.retry("failed")));
  return { retried: jobIds };
}

export async function enqueueAdminMaintenance(action: "delivery_reconciliation" | "usage_reconciliation"): Promise<boolean> {
  const queue = getWebhookQueue(); if (!queue) return false;
  await queue.add("admin-maintenance", { action }, { jobId: `admin-maintenance:${action}`, removeOnComplete: true, removeOnFail: 100, attempts: 2, backoff: { type: "fixed", delay: 5_000 } });
  return true;
}

export async function enqueueAdminDeletion(jobId: string): Promise<boolean> {
  const queue = getWebhookQueue();
  if (!queue) return false;
  const existing = await queue.getJob(`admin-deletion:${jobId}`);
  if (existing) {
    if (await existing.getState() === "failed") await existing.retry("failed");
    return true;
  }
  await queue.add("admin-deletion", { jobId }, {
    jobId: `admin-deletion:${jobId}`,
    attempts: getServerEnv().deletionJobAttempts,
    backoff: { type: "exponential", delay: getServerEnv().deletionJobBackoffMs },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  });
  return true;
}

export async function deleteQueuedWorkspaceEvents(workspaceId: string): Promise<void> {
  const queue = getWebhookQueue();
  if (!queue) return;
  const states: JobType[] = ["waiting", "delayed", "prioritized", "waiting-children", "failed", "completed"];
  let start = 0;
  for (;;) {
    const page = await queue.getJobs(states, start, start + JOB_SCAN_PAGE_SIZE - 1);
    const matches = page.filter((job) => job?.data?.workspaceId === workspaceId);
    await Promise.all(matches.map((job) => job.remove()));
    if (page.length < JOB_SCAN_PAGE_SIZE) break;
    start += JOB_SCAN_PAGE_SIZE - matches.length;
  }
  const active = await queue.getJobs(["active"], 0, JOB_SCAN_PAGE_SIZE - 1);
  if (active.some((job) => job?.data?.workspaceId === workspaceId)) throw new Error("workspace_jobs_active");
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
      if (job && (job.data?.accountId === igUserId || job.data?.igAccountId === igUserId)) matches.push(job);
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

/**
 * Enqueue a Facebook Page feed event. Uses the same queue (and therefore the
 * same worker) as Instagram events; the worker dispatches on the job name
 * ("facebook-event" vs "instagram-event"). Sharing the queue avoids spinning
 * up a second Redis connection and lets the same concurrency setting cover
 * both channels.
 */
export async function enqueueFacebookEvents(events: FacebookNormalizedEvent[]): Promise<number> {
  const queue = getWebhookQueue();
  if (!queue) return 0;
  await Promise.all(
    events.map((event) =>
      queue.add("facebook-event", event, {
        jobId: createFacebookWebhookJobId(event),
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000, jitter: 0.5 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      }),
    ),
  );
  return events.length;
}

export async function enqueueLeadDelivery(job: LeadDeliveryJob): Promise<boolean> {
  const queue = getWebhookQueue();
  if (!queue) return false;
  await queue.add("lead-delivery", job, {
    jobId: createLeadDeliveryJobId(job.deliveryKey),
    attempts: 3,
    backoff: { type: "exponential", delay: 1_000 },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  });
  return true;
}

// Flow follow-ups: a delayed nudge ("Still interested?") scheduled after a DM
// flow's own messages. The rendered copy travels in the job so a later
// definition edit cannot silently rewrite what was already promised.
export type FlowFollowUpJob = {
  deliveryKey: string;
  workspaceId: string;
  automationId: string;
  instagramAccountId: string;
  recipientId: string;
  delayMinutes: number;
  message:
    | { type: "text"; text: string }
    | { type: "button"; text: string; buttonLabel: string; url: string };
};

export function createFlowFollowUpJobId(deliveryKey: string): string {
  return createHash("sha256").update(`followup\0${deliveryKey}`).digest("base64url");
}

export async function enqueueFlowFollowUps(jobs: FlowFollowUpJob[]): Promise<number> {
  const queue = getWebhookQueue();
  if (!queue) return 0;
  await Promise.all(
    jobs.map((job) =>
      queue.add("flow-followup", job, {
        jobId: createFlowFollowUpJobId(job.deliveryKey),
        delay: Math.max(0, Math.min(job.delayMinutes, 10_080)) * 60_000,
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      }),
    ),
  );
  return jobs.length;
}
// Broadcasts: one DM per contact, fanned out as staggered jobs (~1/second) so a
// blast never hammers Meta's per-account messaging limits.
export type BroadcastSendJob = {
  deliveryKey: string;
  broadcastId: string;
  workspaceId: string;
  igAccountId: string;
  igScopedUserId: string;
};

export type BroadcastRecipientKey = Pick<BroadcastSendJob, "igAccountId" | "igScopedUserId">;
export type BroadcastEnqueueResult = {
  accepted: BroadcastRecipientKey[];
  rejected: BroadcastRecipientKey[];
};

/** Whether background delivery is available at all - broadcasts depend on it. */
export function isQueueConfigured(): boolean {
  return Boolean(getServerEnv().redisUrl);
}

export async function getWebhookQueueCounts(): Promise<WebhookQueueCounts> {
  const queue = getWebhookQueue();
  if (!queue) return { state: "not_configured", waiting: 0, active: 0, delayed: 0, failed: 0 };
  try {
    const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed");
    return {
      state: "ok",
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
    };
  } catch {
    return { state: "error", waiting: 0, active: 0, delayed: 0, failed: 0 };
  }
}

export async function enqueueBroadcastSends(
  jobs: BroadcastSendJob[],
  baseDelayMs = 0,
): Promise<BroadcastEnqueueResult> {
  const queue = getWebhookQueue();
  const recipientKey = (job: BroadcastSendJob): BroadcastRecipientKey => ({
    igAccountId: job.igAccountId,
    igScopedUserId: job.igScopedUserId,
  });
  if (!queue) return { accepted: [], rejected: jobs.map(recipientKey) };
  const results = await Promise.allSettled(
    jobs.map((job, index) =>
      queue.add(
        "broadcast-send",
        job,
        {
          jobId: `broadcast:${job.broadcastId}:${job.igAccountId}:${job.igScopedUserId}`,
          delay: baseDelayMs + Math.min(index, 600) * 1_000,
          attempts: 2,
          backoff: { type: "fixed", delay: 5_000 },
          removeOnComplete: 500,
          removeOnFail: 1_000,
        },
      ),
    ),
  );
  const accepted: BroadcastRecipientKey[] = [];
  const rejected: BroadcastRecipientKey[] = [];
  results.forEach((result, index) => {
    const key = recipientKey(jobs[index]);
    (result.status === "fulfilled" ? accepted : rejected).push(key);
  });
  return { accepted, rejected };
}
