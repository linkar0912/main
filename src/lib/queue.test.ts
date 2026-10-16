import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedEvent } from "./automation/types";
import { THROTTLE_PAUSE_MS } from "./automation/account-pause";
import { logger } from "./logger";
import {
  createLeadDeliveryJobId,
  createFacebookEventJobOptions,
  createInstagramEventJobOptions,
  getAdminQueueSnapshot,
  getWebhookQueueCounts,
  QUEUE_PRIORITY,
  QUEUE_READY_TIMEOUT_MS,
  REALTIME_EVENT_RETRY,
  createWebhookJobId,
  enqueueBroadcastSends,
  enqueueFacebookEvents,
  enqueueFlowFollowUps,
  enqueueLeadDelivery,
  enqueueManualReplyEchoes,
  enqueueWebhookEvents,
} from "./queue";

// Stand-ins for BullMQ's Queue and its ioredis connection. Each new Queue
// takes the next readiness from `readiness` (ready at once by default).
const fake = vi.hoisted(() => ({
  readiness: [] as Array<() => Promise<unknown>>,
  queues: [] as Array<{
    add: ReturnType<typeof vi.fn>;
    getJobCounts: ReturnType<typeof vi.fn>;
    emitError(error: Error): void;
  }>,
  clients: [] as Array<{ disconnect: ReturnType<typeof vi.fn> }>,
}));

vi.mock("ioredis", () => ({
  default: class Redis {
    disconnect = vi.fn();
    constructor() {
      fake.clients.push(this);
    }
  },
}));

vi.mock("bullmq", () => ({
  Queue: class Queue {
    add = vi.fn(async () => ({ id: "job" }));
    getJobCounts = vi.fn(async () => ({ waiting: 0, prioritized: 0, active: 0, delayed: 0, failed: 0 }));
    private readonly ready: Promise<unknown>;
    private readonly errorListeners: Array<(error: Error) => void> = [];
    constructor() {
      this.ready = (fake.readiness.shift() ?? (() => Promise.resolve()))();
      this.ready.catch(() => undefined);
      fake.queues.push(this);
    }
    waitUntilReady() {
      return this.ready;
    }
    on(event: string, listener: (error: Error) => void) {
      if (event === "error") this.errorListeners.push(listener);
      return this;
    }
    emitError(error: Error) {
      for (const listener of this.errorListeners) listener(error);
    }
  },
}));

const event: NormalizedEvent = {
  id: "quick_reply_1",
  accountId: "ig_1",
  type: "quick_reply.received",
  text: "Send it",
  recipientId: "igsid_1",
  interactionPayload: "signed-value",
  timestamp: 1,
};

describe("webhook queue", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  afterEach(() => {
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
  });

  it("stays in demo mode when Redis is not configured", async () => {
    delete process.env.REDIS_URL;
    expect(await enqueueWebhookEvents([event])).toBe(0);
  });

  it("uses a deterministic BullMQ-safe job id", () => {
    expect(createWebhookJobId(event)).toBe(createWebhookJobId(event));
    expect(createWebhookJobId(event)).not.toContain(":");
  });

  it("uses a deterministic BullMQ-safe lead delivery id", () => {
    expect(createLeadDeliveryJobId("lead:key:1")).toBe(createLeadDeliveryJobId("lead:key:1"));
    expect(createLeadDeliveryJobId("lead:key:1")).not.toContain(":");
  });

  it("prioritizes realtime events and stamps their ingestion time", () => {
    expect(createInstagramEventJobOptions(event, 1_725_000_000_000)).toEqual({
      data: { ...event, linkarIngestedAt: 1_725_000_000_000 },
      options: expect.objectContaining({
        jobId: createWebhookJobId(event),
        priority: QUEUE_PRIORITY.REALTIME,
      }),
    });

    const facebookEvent = {
      id: "facebook_1",
      pageId: "page_1",
      postId: "post_1",
      commentId: "comment_1",
      text: "guide",
      timestamp: 1,
    };
    expect(createFacebookEventJobOptions(facebookEvent, 1_725_000_000_100)).toEqual({
      data: { ...facebookEvent, linkarIngestedAt: 1_725_000_000_100 },
      options: expect.objectContaining({ priority: QUEUE_PRIORITY.REALTIME }),
    });
  });

  it("retries realtime events minutes apart with jitter, not within seconds", () => {
    // Meta asks for a slowdown far more often than a send fails for good;
    // 1-4 second retries only hit the same throttle again.
    expect(REALTIME_EVENT_RETRY).toEqual({
      attempts: 6,
      backoff: { type: "exponential", delay: 60_000, jitter: 0.5 },
    });
    const facebookEvent = { id: "facebook_1", pageId: "page_1", postId: "post_1", commentId: "comment_1", text: "guide", timestamp: 1 };
    for (const { options } of [createInstagramEventJobOptions(event), createFacebookEventJobOptions(facebookEvent)]) {
      expect(options).toMatchObject({ attempts: 6, backoff: { type: "exponential", delay: 60_000, jitter: 0.5 } });
      // Each job gets its own copy, so nothing can edit the shared policy.
      expect(options.backoff).not.toBe(REALTIME_EVENT_RETRY.backoff);
    }
  });

  it("keeps retrying a realtime event for longer than an account's throttle pause", () => {
    // BullMQ waits delay * 2^(n-1), less up to `jitter` of it, before retry n.
    // Even at the shortest jittered waits, a campaign DM held by the pause is
    // still being retried when the pause ends.
    const { attempts, backoff } = REALTIME_EVENT_RETRY;
    let shortestSpan = 0;
    for (let retry = 1; retry < attempts; retry += 1) {
      shortestSpan += backoff.delay * 2 ** (retry - 1) * (1 - backoff.jitter);
    }
    expect(shortestSpan).toBeGreaterThan(THROTTLE_PAUSE_MS);
  });

  it("reports that durable lead queuing is unavailable without Redis", async () => {
    delete process.env.REDIS_URL;
    await expect(enqueueLeadDelivery({
      deliveryKey: "lead:key:1",
      workspaceId: "workspace_a",
      kind: "LEAD_WEBHOOK",
    })).resolves.toBe(false);
  });
});

describe("producer queue readiness", () => {
  const originalRedisUrl = process.env.REDIS_URL;
  const cache = globalThis as { linkarWebhookQueue?: unknown; linkarWebhookRedis?: unknown; linkarBulkQueue?: unknown; linkarBulkRedis?: unknown };

  function clearCache() {
    delete cache.linkarWebhookQueue;
    delete cache.linkarWebhookRedis;
    delete cache.linkarBulkQueue;
    delete cache.linkarBulkRedis;
  }

  beforeEach(() => {
    process.env.REDIS_URL = "redis://queue.test:6379";
    fake.readiness.length = 0;
    fake.queues.length = 0;
    fake.clients.length = 0;
    clearCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    clearCache();
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
  });

  it("drops a Queue whose first connection failed, so the next call builds a fresh one", async () => {
    // BullMQ's start-up INFO timed out during a Valkey stall: that Queue never works again.
    fake.readiness.push(() => Promise.reject(new Error("Command timed out")));

    await expect(enqueueWebhookEvents([event])).rejects.toThrow("queue_unavailable");
    expect(cache.linkarWebhookQueue).toBeUndefined();
    expect(cache.linkarWebhookRedis).toBeUndefined();
    expect(fake.clients[0].disconnect).toHaveBeenCalledOnce();

    await expect(enqueueWebhookEvents([event])).resolves.toBe(1);
    expect(fake.queues).toHaveLength(2);
    expect(fake.queues[0].add).not.toHaveBeenCalled();
    expect(fake.queues[1].add).toHaveBeenCalledOnce();
    expect(cache.linkarWebhookQueue).toBe(fake.queues[1]);
  });

  it("gives up with queue_unavailable at the deadline while the connection never comes up", async () => {
    vi.useFakeTimers();
    fake.readiness.push(() => new Promise(() => undefined));
    const settled = vi.fn();
    const pending = enqueueWebhookEvents([event]);
    pending.then(settled, settled);

    await vi.advanceTimersByTimeAsync(QUEUE_READY_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toThrow("queue_unavailable");
    expect(fake.queues[0].add).not.toHaveBeenCalled();
    // Still connecting, not failed: the same Queue is kept for when Valkey is back.
    expect(cache.linkarWebhookQueue).toBe(fake.queues[0]);
  });

  it("reports queue counts as an error and the owner console snapshot as unavailable instead of hanging", async () => {
    vi.useFakeTimers();
    fake.readiness.push(() => new Promise(() => undefined), () => new Promise(() => undefined));
    const counts = getWebhookQueueCounts();
    const snapshot = getAdminQueueSnapshot("webhooks");
    snapshot.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(QUEUE_READY_TIMEOUT_MS);
    await expect(counts).resolves.toEqual({ state: "error", waiting: 0, active: 0, delayed: 0, failed: 0 });
    await expect(snapshot).rejects.toThrow("queue_unavailable");
  });

  // Webhook routes and the runner call these with whatever a request held,
  // often nothing: an empty list must not wait on (or fail with) the queue.
  describe("an empty list resolves without touching the queue, even while it would fail to become ready", () => {
    beforeEach(() => {
      fake.readiness.push(() => Promise.reject(new Error("connect ECONNREFUSED")));
    });

    afterEach(() => {
      expect(fake.queues).toHaveLength(0);
      expect(fake.clients).toHaveLength(0);
      expect(fake.readiness).toHaveLength(1);
      expect(cache.linkarWebhookQueue).toBeUndefined();
      expect(cache.linkarBulkQueue).toBeUndefined();
    });

    it("enqueueWebhookEvents", async () => {
      await expect(enqueueWebhookEvents([])).resolves.toBe(0);
    });

    it("enqueueManualReplyEchoes", async () => {
      await expect(enqueueManualReplyEchoes([])).resolves.toBe(0);
    });

    it("enqueueFacebookEvents", async () => {
      await expect(enqueueFacebookEvents([])).resolves.toBe(0);
    });

    it("enqueueFlowFollowUps", async () => {
      await expect(enqueueFlowFollowUps([])).resolves.toBe(0);
    });

    it("enqueueBroadcastSends", async () => {
      await expect(enqueueBroadcastSends([])).resolves.toEqual({ accepted: [], rejected: [] });
    });
  });

  it("logs queue connection errors at most once a minute", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-16T10:00:00.000Z"));
    await enqueueWebhookEvents([event]);
    const queue = fake.queues[0];

    queue.emitError(new Error("connect ECONNREFUSED"));
    queue.emitError(new Error("connect ECONNREFUSED"));
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("Queue connection error", { error: "connect ECONNREFUSED" });
    vi.setSystemTime(Date.parse("2026-10-16T10:01:00.000Z"));
    queue.emitError(new Error("connect ECONNREFUSED"));
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
