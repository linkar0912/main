import { afterEach, describe, expect, it } from "vitest";
import type { NormalizedEvent } from "./automation/types";
import { THROTTLE_PAUSE_MS } from "./automation/account-pause";
import {
  createLeadDeliveryJobId,
  createFacebookEventJobOptions,
  createInstagramEventJobOptions,
  QUEUE_PRIORITY,
  REALTIME_EVENT_RETRY,
  createWebhookJobId,
  enqueueLeadDelivery,
  enqueueWebhookEvents,
} from "./queue";

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
