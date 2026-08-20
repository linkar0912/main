import { afterEach, describe, expect, it } from "vitest";
import type { NormalizedEvent } from "./automation/types";
import { createWebhookJobId, enqueueWebhookEvents } from "./queue";

const event: NormalizedEvent = {
  id: "comment_1",
  accountId: "ig_1",
  type: "comment.created",
  text: "guide",
  commentId: "comment_1",
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
});
