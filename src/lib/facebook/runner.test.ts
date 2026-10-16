import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { FacebookApiError, FacebookClient } from "./client";
import type { FacebookConnection, FacebookSendResult } from "./types";
import { facebookReplyDeliveryKey, processNormalizedFacebookEvent, RetryableFacebookError, isRetryableFacebookError, selectFacebookReplyText } from "./runner";
import type { FacebookNormalizedEvent } from "./types";
import type { CommentTrigger, FlowDefinitionV1 } from "../automation/types";
import type { AutomationRepository } from "../repository";
import {
  checkSendRateLimit,
  publicReplyCommentPosition,
  resetSendRateLimitFallback,
} from "../automation/send-rate-limiter";
import {
  checkAccountSendGate,
  recordAccountBlock,
  recordAccountThrottle,
  resetAccountPauseStateForTests,
  type SendPauseTarget,
} from "../automation/account-pause";
import { findSendDeferral } from "../automation/send-deferral";
import { parseAccountPauseReason } from "../meta/errors";
import { notifyWorkspaceManagers } from "../notifications";

vi.mock("../notifications", () => ({ notifyWorkspaceManagers: vi.fn(async () => true) }));

const TOKEN_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function definition(trigger: { match: "any" | "keyword"; keywords: string[] }): FlowDefinitionV1 {
  const full: CommentTrigger = {
    type: "comment",
    match: trigger.match,
    keywords: trigger.keywords,
    mediaIds: [],
  };
  return {
    version: 1,
    trigger: full,
    conditions: [],
    actions: [{ type: "private_reply", text: "Hi {username}, here is your guide." }],
    dailySendLimit: 100,
  };
}

function commentEvent(overrides: Partial<FacebookNormalizedEvent> = {}): FacebookNormalizedEvent {
  return {
    id: "evt_1",
    pageId: "page_1",
    commentId: "comment_1",
    postId: "post_1",
    text: "guide please",
    senderId: "user_1",
    senderName: "Maya",
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

function fakeClient(overrides: { postCommentReply?: ReturnType<typeof vi.fn> } = {}): { client: FacebookClient; postCommentReply: ReturnType<typeof vi.fn> } {
  const postCommentReply = overrides.postCommentReply ?? vi.fn(async (): Promise<FacebookSendResult> => ({ id: "fb_comment_42" }));
  const client = {
    postCommentReply: postCommentReply as unknown as FacebookClient["postCommentReply"],
  } as unknown as FacebookClient;
  return { client, postCommentReply };
}

async function seedConnection(repository: AutomationRepository, pageId: string) {
  await repository.upsertFacebookPage({
    workspaceId: "workspace_a",
    pageId,
    pageName: "Acme",
    accessTokenEncrypted: sealSecret("page-tok", TOKEN_KEY),
    status: "CONNECTED",
  });
}

async function seedActiveAutomation(
  repository: AutomationRepository,
  name: string,
  trigger: { match: "any" | "keyword"; keywords: string[] },
  extras: Partial<FlowDefinitionV1> = {},
) {
  const created = await repository.createAutomation("workspace_a", {
    facebookPageId: "page_1",
    name,
    definition: { ...definition(trigger), ...extras },
  });
  await repository.updateAutomation("workspace_a", created.id, { status: "ACTIVE" });
}

describe("processNormalizedFacebookEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T10:00:00.000Z"));
    // Tests run without Redis, so public replies draw on the in-process
    // fallback budget; start every test with it empty.
    resetSendRateLimitFallback();
    // Throttles from earlier tests must not add up to a Page pause here.
    resetAccountPauseStateForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns zero counts when the page is not connected to any workspace", async () => {
    const repository = createMemoryRepository();
    const result = await processNormalizedFacebookEvent(commentEvent(), repository);
    expect(result).toEqual({ matched: 0, sent: 0, skipped: 0, failed: 0 });
  });

  it("posts a public comment reply when the keyword matches", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Guide", { match: "keyword", keywords: ["guide"] });
    const { client, postCommentReply } = fakeClient();
    const result = await processNormalizedFacebookEvent(commentEvent(), repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });
    expect(result).toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });
    expect(postCommentReply).toHaveBeenCalledTimes(1);
    const [connection, commentId, text] = postCommentReply.mock.calls[0] as [FacebookConnection, string, string];
    expect(connection.pageId).toBe("page_1");
    expect(connection.accessToken).toBe("page-tok");
    expect(commentId).toBe("comment_1");
    expect(text).toContain("Hi Maya");
  });

  it("does nothing when no automation matches the comment", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Other", { match: "keyword", keywords: ["unrelated"] });
    const { client, postCommentReply } = fakeClient();
    const result = await processNormalizedFacebookEvent(commentEvent({ text: "guide please" }), repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });
    expect(result.matched).toBe(0);
    expect(postCommentReply).not.toHaveBeenCalled();
  });

  it("uses shared include, exclusion, and condition policies", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Qualified", { match: "keyword", keywords: ["price", "please"] }, {
      trigger: {
        type: "comment",
        match: "keyword",
        mode: "all",
        keywords: ["price", "please"],
        negativeKeywords: ["spam"],
        mediaIds: ["post_1"],
      },
      conditions: [{ type: "contains_keyword", keywords: ["details"] }],
    });
    const { client, postCommentReply } = fakeClient();

    const blocked = await processNormalizedFacebookEvent(commentEvent({ text: "price please details spam" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    const wrongPost = await processNormalizedFacebookEvent(commentEvent({ id: "evt_2", commentId: "c2", postId: "post_2", text: "price please details" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    const allowed = await processNormalizedFacebookEvent(commentEvent({ id: "evt_3", commentId: "c3", text: "price please details" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(blocked.matched).toBe(0);
    expect(wrongPost.matched).toBe(0);
    expect(allowed.sent).toBe(1);
    expect(postCommentReply).toHaveBeenCalledTimes(1);
  });

  it("selects one reply variant deterministically from the comment id", () => {
    const flow = definition({ match: "any", keywords: [] });
    flow.actions = [{ type: "private_reply", text: "One", textVariants: ["Two", "Three", "Four"] }];

    expect(selectFacebookReplyText(flow, "comment_42")).toBe(selectFacebookReplyText(flow, "comment_42"));
    expect(["One", "Two", "Three", "Four"]).toContain(selectFacebookReplyText(flow, "comment_42"));
    expect(new Set(Array.from({ length: 20 }, (_, index) => selectFacebookReplyText(flow, `comment_${index}`))).size).toBeGreaterThan(1);
  });

  it("lets only the highest-priority matching Page automation reply", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Low priority", { match: "any", keywords: [] });
    await seedActiveAutomation(repository, "High priority", { match: "any", keywords: [] });
    const automations = await repository.listAutomations("workspace_a");
    const high = automations.find((automation) => automation.name === "High priority")!;
    await repository.updateAutomation("workspace_a", high.id, { priority: 10 });
    const { client, postCommentReply } = fakeClient();

    const result = await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(result.matched).toBe(1);
    expect(result.sent).toBe(1);
    expect(postCommentReply).toHaveBeenCalledTimes(1);
  });

  it("dedupes the same event id so a redelivery does not double-post", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Guide", { match: "any", keywords: [] });
    const { client, postCommentReply } = fakeClient();
    await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    const result = await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(postCommentReply).toHaveBeenCalledTimes(1);
    expect(result.skipped).toBe(1);
  });

  it("records a FAILED execution and surfaces a non-retryable error", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Guide", { match: "any", keywords: [] });
    const { client } = fakeClient({
      postCommentReply: vi.fn(async () => {
        throw new FacebookApiError("OAuth error", 400, true, false);
      }),
    });
    const result = await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(result.failed).toBe(1);
    const executions = await repository.listAutomations("workspace_a");
    expect(executions[0]!.definition).toBeDefined();
  });

  it("records stable failure categories without leaking Graph messages", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Guide", { match: "any", keywords: [] });
    const completeExecution = vi.spyOn(repository, "completeExecution");
    const { client } = fakeClient({
      postCommentReply: vi.fn(async () => {
        throw new FacebookApiError("Sensitive provider detail", 403, true, false, 200);
      }),
    });

    await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(completeExecution).toHaveBeenCalledWith("workspace_a", expect.any(String), expect.objectContaining({
      status: "FAILED",
      reason: "permission_missing",
    }));
  });

  it("classifies a legacy unsupported Page definition without attempting delivery", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    const created = await repository.createAutomation("workspace_a", {
      provider: "FACEBOOK",
      facebookPageId: "page_1",
      name: "Legacy invalid Page flow",
      definition: {
        version: 1,
        trigger: { type: "message", match: "any", keywords: [] },
        conditions: [],
        actions: [{ type: "send_text", text: "Hello" }],
      },
    });
    await repository.updateAutomation("workspace_a", created.id, { status: "ACTIVE" });
    const recordExecution = vi.spyOn(repository, "recordExecution");
    const { client, postCommentReply } = fakeClient();

    const result = await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(result.failed).toBe(1);
    expect(recordExecution).toHaveBeenCalledWith(expect.objectContaining({ status: "FAILED", reason: "invalid_channel_definition" }));
    expect(postCommentReply).not.toHaveBeenCalled();
  });

  it("translates a retryable API error into RetryableFacebookError", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Guide", { match: "any", keywords: [] });
    const { client } = fakeClient({
      postCommentReply: vi.fn(async () => {
        throw new FacebookApiError("throttled", 429, true, true);
      }),
    });
    await expect(
      processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY }),
    ).rejects.toBeInstanceOf(RetryableFacebookError);
  });

  it("skips inside the daily send limit with a clear reason", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Limited", { match: "any", keywords: [] }, { dailySendLimit: 1 });
    // Pre-fill the daily slot so the runner's reservation is rejected.
    const automations = await repository.listAutomations("workspace_a");
    const target = automations[0]!;
    const today = new Date().toISOString().slice(0, 10);
    const claimed = await repository.claimAutomationSendSlots(target.id, today, 1, 1);
    expect(claimed).toBe(true);
    const { client, postCommentReply } = fakeClient();
    const result = await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(result.skipped).toBe(1);
    expect(postCommentReply).not.toHaveBeenCalled();
  });

  it("retains a successful send against the daily quota so the next event is blocked", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Limited", { match: "any", keywords: [] }, { dailySendLimit: 1 });
    const { client, postCommentReply } = fakeClient();

    const first = await processNormalizedFacebookEvent(commentEvent({ id: "evt_1", commentId: "comment_1" }), repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });
    const second = await processNormalizedFacebookEvent(commentEvent({ id: "evt_2", commentId: "comment_2" }), repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });

    expect(first.sent).toBe(1);
    expect(second.skipped).toBe(1);
    expect(postCommentReply).toHaveBeenCalledTimes(1);
  });

  it("releases the daily quota reservation after a retryable provider failure", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Limited", { match: "any", keywords: [] }, { dailySendLimit: 1 });
    const postCommentReply = vi.fn()
      .mockRejectedValueOnce(new FacebookApiError("throttled", 429, true, true))
      .mockResolvedValueOnce({ id: "fb_comment_42" });
    const { client } = fakeClient({ postCommentReply });

    await expect(processNormalizedFacebookEvent(commentEvent(), repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    })).rejects.toBeInstanceOf(RetryableFacebookError);

    const retry = await processNormalizedFacebookEvent(commentEvent(), repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });
    expect(retry.sent).toBe(1);
    expect(postCommentReply).toHaveBeenCalledTimes(2);
  });

  it("never retries a public reply whose outcome is unknown (network failure)", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Guide", { match: "any", keywords: [] });
    const postCommentReply = vi.fn().mockRejectedValue(new FacebookApiError("Facebook request timed out", 0, false));
    const { client } = fakeClient({ postCommentReply });

    const first = await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(first.failed).toBe(1);
    // A redelivery or admin replay of the same event must not post again.
    await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(postCommentReply).toHaveBeenCalledTimes(1);
  });

  it("reuses a recorded reply when a crashed worker's claim is taken over", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Guide", { match: "any", keywords: [] });
    const [automation] = await repository.listAutomations("workspace_a");
    const { client, postCommentReply } = fakeClient();
    // Worker A claimed the event, posted the reply and recorded it in the
    // ledger, then died before completing its execution claim.
    await repository.claimExecution({
      workspaceId: "workspace_a",
      automationId: automation!.id,
      externalEventId: "evt_1",
      dedupeKey: `${automation!.id}:evt_1`,
    });
    const deliveryKey = facebookReplyDeliveryKey(automation!.id, "evt_1");
    await repository.ensureOutboundDelivery({
      deliveryKey,
      workspaceId: "workspace_a",
      automationId: automation!.id,
      kind: "CLASSIC_ACTION",
      payload: { type: "facebook_comment_reply", commentId: "comment_1", text: "Hi" },
    });
    await repository.claimOutboundDelivery(deliveryKey, "worker_a", "2026-08-29T10:00:30.000Z");
    await repository.completeOutboundDelivery(deliveryKey, "worker_a", "fb_comment_1", "2026-08-29T10:00:01.000Z");

    vi.setSystemTime(new Date("2026-08-29T10:10:00.000Z"));
    const retry = await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(retry.sent).toBe(1);
    expect(postCommentReply).not.toHaveBeenCalled();
    expect(await repository.getExecution("workspace_a", `${automation!.id}:evt_1`)).toMatchObject({ status: "SENT" });
  });

  it("retries later, without posting, while another worker holds the reply claim", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Guide", { match: "any", keywords: [] });
    const [automation] = await repository.listAutomations("workspace_a");
    const deliveryKey = facebookReplyDeliveryKey(automation!.id, "evt_1");
    await repository.ensureOutboundDelivery({
      deliveryKey,
      workspaceId: "workspace_a",
      automationId: automation!.id,
      kind: "CLASSIC_ACTION",
      payload: { type: "facebook_comment_reply", commentId: "comment_1", text: "Hi" },
    });
    await repository.claimOutboundDelivery(deliveryKey, "worker_a", "2026-08-29T10:00:30.000Z");
    const { client, postCommentReply } = fakeClient();

    await expect(processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY }))
      .rejects.toBeInstanceOf(RetryableFacebookError);
    expect(postCommentReply).not.toHaveBeenCalled();
    expect(await repository.getExecution("workspace_a", `${automation!.id}:evt_1`)).toBeNull();
  });

  it("marks the Page expired when Meta rejects its token (code 190)", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Guide", { match: "any", keywords: [] });
    const { client } = fakeClient({
      postCommentReply: vi.fn(async () => {
        throw new FacebookApiError("Error validating access token", 400, true, false, 190);
      }),
    });

    await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect((await repository.listFacebookPages("workspace_a"))[0]?.status).toBe("EXPIRED");
  });

  it("replyOncePerUser sends the first reply and skips later comments from that sender", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Once", { match: "any", keywords: [] }, {
      trigger: {
        type: "comment",
        match: "any",
        keywords: [],
        mediaIds: [],
        replyOncePerUser: true,
      },
    });
    const { client, postCommentReply } = fakeClient();

    const first = await processNormalizedFacebookEvent(commentEvent({ id: "evt_1", commentId: "comment_1" }), repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });
    const second = await processNormalizedFacebookEvent(commentEvent({ id: "evt_2", commentId: "comment_2" }), repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });

    expect(first.sent).toBe(1);
    expect(second.skipped).toBe(1);
    expect(postCommentReply).toHaveBeenCalledTimes(1);
  });

  it("treats any-comment match (keywords=[]) as a match without requiring a keyword", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Any", { match: "any", keywords: [] });
    const { client, postCommentReply } = fakeClient();
    const result = await processNormalizedFacebookEvent(
      commentEvent({ text: "doesn't matter what's here" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );
    expect(result.sent).toBe(1);
    expect(postCommentReply).toHaveBeenCalledTimes(1);
  });

  it("returns a SKIPPED outcome without a client when demo mode is active", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Guide", { match: "any", keywords: [] });
    const result = await processNormalizedFacebookEvent(commentEvent(), repository, {});
    expect(result.skipped).toBe(1);
  });
});

describe("isRetryableFacebookError", () => {
  it("returns true for RetryableFacebookError and false otherwise", () => {
    expect(isRetryableFacebookError(new RetryableFacebookError("x"))).toBe(true);
    expect(isRetryableFacebookError(new Error("x"))).toBe(false);
    expect(isRetryableFacebookError("x")).toBe(false);
  });
});

describe("Facebook public-reply guard", () => {
  const originalRedisUrl = process.env.REDIS_URL;
  const originalCommentLimit = process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T10:00:00.000Z"));
    // No Redis: the Page's public replies use the in-process fallback, a
    // quarter of the hourly budget. 40 an hour gives a fallback budget of 10.
    delete process.env.REDIS_URL;
    process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = "40";
    resetSendRateLimitFallback();
    resetAccountPauseStateForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetSendRateLimitFallback();
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
    if (originalCommentLimit === undefined) delete process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR;
    else process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = originalCommentLimit;
  });

  async function usePageReplies(count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      expect((await checkSendRateLimit("page_1", "comment_reply")).allowed).toBe(true);
    }
  }

  it("skips, rather than defers, once the Page's hourly public-reply budget is used", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Guide", { match: "keyword", keywords: ["guide"] });
    const [automation] = await repository.listAutomations("workspace_a");
    await usePageReplies(10);
    const { client, postCommentReply } = fakeClient();

    const result = await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(result).toEqual({ matched: 1, sent: 0, skipped: 1, failed: 0 });
    expect(postCommentReply).not.toHaveBeenCalled();
    expect(await repository.getExecution("workspace_a", `${automation!.id}:evt_1`)).toMatchObject({
      status: "SKIPPED",
      reason: "public_reply_hourly_limit",
    });
  });

  it("thins out replies past half the budget, deterministically by comment", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Guide", { match: "any", keywords: [] });
    const [automation] = await repository.listAutomations("workspace_a");
    // 9 of 10 used: only comments in the first 20% still get a public reply.
    expect(publicReplyCommentPosition("comment_1")).toBeGreaterThanOrEqual(0.2);
    expect(publicReplyCommentPosition("comment_a")).toBeLessThan(0.2);
    await usePageReplies(9);
    const { client, postCommentReply } = fakeClient();

    const tapered = await processNormalizedFacebookEvent(
      commentEvent({ id: "evt_1", commentId: "comment_1" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );
    const kept = await processNormalizedFacebookEvent(
      commentEvent({ id: "evt_2", commentId: "comment_a" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );

    expect(tapered.skipped).toBe(1);
    expect(kept.sent).toBe(1);
    expect(postCommentReply).toHaveBeenCalledTimes(1);
    expect(postCommentReply.mock.calls[0]?.[1]).toBe("comment_a");
    expect(await repository.getExecution("workspace_a", `${automation!.id}:evt_1`)).toMatchObject({
      status: "SKIPPED",
      reason: "public_reply_tapered",
    });
  });

  it("gives back the daily slot and the reply-once claim when a reply is skipped", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(
      repository,
      "Limited",
      { match: "any", keywords: [] },
      {
        dailySendLimit: 1,
        trigger: { type: "comment", match: "any", keywords: [], mediaIds: [], replyOncePerUser: true },
      },
    );
    await usePageReplies(10);
    const { client, postCommentReply } = fakeClient();

    const skipped = await processNormalizedFacebookEvent(
      commentEvent({ id: "evt_1", commentId: "comment_1" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );
    // A new hour: the same person's next comment still gets the one daily reply.
    resetSendRateLimitFallback();
    const next = await processNormalizedFacebookEvent(
      commentEvent({ id: "evt_2", commentId: "comment_2" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );

    expect(skipped.skipped).toBe(1);
    expect(next.sent).toBe(1);
    expect(postCommentReply).toHaveBeenCalledTimes(1);
  });

  it("reuses a reply a crashed worker already posted, even when the budget is used up", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Guide", { match: "any", keywords: [] });
    const [automation] = await repository.listAutomations("workspace_a");
    const { client, postCommentReply } = fakeClient();
    await repository.claimExecution({
      workspaceId: "workspace_a",
      automationId: automation!.id,
      externalEventId: "evt_1",
      dedupeKey: `${automation!.id}:evt_1`,
    });
    const deliveryKey = facebookReplyDeliveryKey(automation!.id, "evt_1");
    await repository.ensureOutboundDelivery({
      deliveryKey,
      workspaceId: "workspace_a",
      automationId: automation!.id,
      kind: "CLASSIC_ACTION",
      payload: { type: "facebook_comment_reply", commentId: "comment_1", text: "Hi" },
    });
    await repository.claimOutboundDelivery(deliveryKey, "worker_a", "2026-08-29T10:00:30.000Z");
    await repository.completeOutboundDelivery(deliveryKey, "worker_a", "fb_comment_1", "2026-08-29T10:00:01.000Z");
    vi.setSystemTime(new Date("2026-08-29T10:10:00.000Z"));
    await usePageReplies(10);

    const retry = await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(retry.sent).toBe(1);
    expect(postCommentReply).not.toHaveBeenCalled();
    expect(await repository.getExecution("workspace_a", `${automation!.id}:evt_1`)).toMatchObject({ status: "SENT" });
  });

  it("does not touch the budget in demo mode", async () => {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Guide", { match: "any", keywords: [] });
    await usePageReplies(10);

    const result = await processNormalizedFacebookEvent(commentEvent(), repository);

    expect(result.skipped).toBe(1);
    const [automation] = await repository.listAutomations("workspace_a");
    expect(await repository.getExecution("workspace_a", `${automation!.id}:evt_1`)).toMatchObject({
      status: "SKIPPED",
      reason: "Facebook delivery is disabled in demo mode",
    });
  });
});

describe("Facebook Page replies while Meta limits the Page", () => {
  const HOUR = 60 * 60_000;
  const NOW = Date.parse("2026-08-29T10:00:00.000Z");
  const PAGE: SendPauseTarget = { channel: "facebook", accountId: "page_1" };
  const BLOCKED = "(#368) The action attempted has been deemed abusive or is otherwise disallowed";
  const PAUSE_ENV_KEYS = ["REDIS_URL", "DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR"] as const;
  const savedEnv = Object.fromEntries(PAUSE_ENV_KEYS.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // No Redis: Page pauses live in this process's memory.
    for (const key of PAUSE_ENV_KEYS) delete process.env[key];
    resetSendRateLimitFallback();
    resetAccountPauseStateForTests();
    vi.mocked(notifyWorkspaceManagers).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAccountPauseStateForTests();
    for (const key of PAUSE_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  async function pageWithAutomation(extras: Partial<FlowDefinitionV1> = {}) {
    const repository = createMemoryRepository();
    await seedConnection(repository, "page_1");
    await seedActiveAutomation(repository, "Guide", { match: "any", keywords: [] }, extras);
    const [automation] = await repository.listAutomations("workspace_a");
    return { repository, automationId: automation!.id };
  }

  it("skips a reply while the Page is blocked, with a plain reason and no call to Facebook", async () => {
    const { repository, automationId } = await pageWithAutomation({
      dailySendLimit: 1,
      trigger: { type: "comment", match: "any", keywords: [], mediaIds: [], replyOncePerUser: true },
    });
    await recordAccountBlock(PAGE);
    const { client, postCommentReply } = fakeClient();

    const result = await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(result).toEqual({ matched: 1, sent: 0, skipped: 1, failed: 0 });
    expect(postCommentReply).not.toHaveBeenCalled();
    expect(await repository.getExecution("workspace_a", `${automationId}:evt_1`)).toMatchObject({
      status: "SKIPPED",
      reason: "page_limited",
    });

    // The pause took neither the day's one reply nor the person's reply-once
    // claim: after it ends, their next comment gets that reply.
    vi.setSystemTime(NOW + 25 * HOUR);
    const later = await processNormalizedFacebookEvent(
      commentEvent({ id: "evt_2", commentId: "comment_2" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );
    expect(later.sent).toBe(1);
  });

  it("parks a reply while the Page cools down after throttling, and posts it once after", async () => {
    const { repository, automationId } = await pageWithAutomation();
    // Three throttles close together pause the Page for 15 minutes.
    for (let index = 0; index < 3; index += 1) await recordAccountThrottle(PAGE);
    const { client, postCommentReply } = fakeClient();

    const held = await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY })
      .catch((thrown: unknown) => thrown);

    const deferral = findSendDeferral(held);
    expect(deferral?.message).toMatch(/^Facebook asked Linkar to slow down/);
    expect(deferral!.delayMs).toBeGreaterThanOrEqual(15 * 60_000);
    expect(postCommentReply).not.toHaveBeenCalled();
    // Nothing is claimed or recorded for a reply that waits.
    expect(await repository.getExecution("workspace_a", `${automationId}:evt_1`)).toBeNull();

    vi.setSystemTime(NOW + 16 * 60_000);
    const retried = await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(retried.sent).toBe(1);
    expect(postCommentReply).toHaveBeenCalledTimes(1);
  });

  it("holds replies over the slow-restart share for a later hour", async () => {
    // 25% of a 4-an-hour DM ceiling: one automatic send an hour while recovering.
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "4";
    // A block whose 24-hour pause ended a minute ago.
    await recordAccountBlock(PAGE, { now: NOW - 24 * HOUR - 60_000 });
    const { repository } = await pageWithAutomation();
    const { client, postCommentReply } = fakeClient();
    const second = commentEvent({ id: "evt_2", commentId: "comment_2", senderId: "user_2" });

    const first = await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    const held = await processNormalizedFacebookEvent(second, repository, { client, tokenEncryptionKey: TOKEN_KEY })
      .catch((thrown: unknown) => thrown);

    expect(first.sent).toBe(1);
    expect(findSendDeferral(held)?.message).toMatch(/^Linkar is replying slowly from this Page/);
    expect(findSendDeferral(held)!.delayMs).toBeGreaterThanOrEqual(HOUR);
    expect(postCommentReply).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW + HOUR + 1_000);
    const retried = await processNormalizedFacebookEvent(second, repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(retried.sent).toBe(1);
    expect(postCommentReply).toHaveBeenCalledTimes(2);
  });

  it("pauses the Page when Facebook answers with a block, tells the owners, and does not retry", async () => {
    const { repository, automationId } = await pageWithAutomation();
    const postCommentReply = vi.fn(async (): Promise<FacebookSendResult> => {
      throw new FacebookApiError(BLOCKED, 400, true, false, 368);
    });
    const { client } = fakeClient({ postCommentReply });

    const result = await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(await repository.getExecution("workspace_a", `${automationId}:evt_1`)).toMatchObject({
      status: "FAILED",
      reason: "page_limited",
    });
    // The refused reply's ledger row says how long the pause runs, for Home.
    const refused = await repository.getOutboundDelivery(facebookReplyDeliveryKey(automationId, "evt_1"));
    expect(refused).toMatchObject({ state: "FAILED", retryable: false, resultCode: "PROVIDER_REJECTED" });
    expect(parseAccountPauseReason(refused?.lastError)).toEqual({ platform: "Facebook", durationMs: 24 * HOUR });
    await expect(checkAccountSendGate(PAGE)).resolves.toMatchObject({ status: "blocked" });
    await vi.waitFor(() => expect(notifyWorkspaceManagers).toHaveBeenCalledOnce());
    expect(vi.mocked(notifyWorkspaceManagers).mock.calls[0]?.[2]).toBe("Facebook has limited Acme");

    // The next comment stops at the pause instead of reaching Facebook.
    const next = await processNormalizedFacebookEvent(
      commentEvent({ id: "evt_2", commentId: "comment_2" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );
    expect(next.skipped).toBe(1);
    expect(postCommentReply).toHaveBeenCalledTimes(1);
  });

  it("never retries into a block, even one Facebook sends with a retryable status", async () => {
    const { repository, automationId } = await pageWithAutomation();
    const { client } = fakeClient({
      postCommentReply: vi.fn(async () => {
        throw new FacebookApiError("Temporary", 500, true, true, 2, 2022);
      }),
    });

    const result = await processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(result.failed).toBe(1);
    expect(await repository.getExecution("workspace_a", `${automationId}:evt_1`)).toMatchObject({ status: "FAILED", reason: "page_limited" });
    await expect(checkAccountSendGate(PAGE)).resolves.toMatchObject({ status: "blocked" });
  });

  it("records each throttle from Facebook, so repeated ones pause the Page", async () => {
    const { repository } = await pageWithAutomation();
    const postCommentReply = vi.fn(async (): Promise<FacebookSendResult> => {
      throw new FacebookApiError("Calls to this api have exceeded the rate limit.", 400, true, true, 4);
    });
    const { client } = fakeClient({ postCommentReply });

    for (let index = 1; index <= 3; index += 1) {
      await expect(processNormalizedFacebookEvent(
        commentEvent({ id: `evt_${index}`, commentId: `comment_${index}` }),
        repository,
        { client, tokenEncryptionKey: TOKEN_KEY },
      )).rejects.toBeInstanceOf(RetryableFacebookError);
      const gate = await checkAccountSendGate(PAGE);
      expect(gate.status).toBe(index < 3 ? "open" : "throttled");
    }

    // A fourth comment waits out the cool-down without reaching Facebook.
    const held = await processNormalizedFacebookEvent(
      commentEvent({ id: "evt_4", commentId: "comment_4" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    ).catch((thrown: unknown) => thrown);
    expect(findSendDeferral(held)).not.toBeNull();
    expect(postCommentReply).toHaveBeenCalledTimes(3);
  });

  it("reads the Pages rate limit (code 80001) as a throttle, and keeps the reply for a retry", async () => {
    const { repository, automationId } = await pageWithAutomation();
    // Through the real client, which decides what is retryable; Meta does not
    // always mark 80001 transient.
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "(#80001) There have been too many calls to this Page account. Wait a bit and try again.", code: 80001, type: "OAuthException" },
    }), { status: 400, headers: { "content-type": "application/json" } }));
    const client = new FacebookClient({ apiVersion: "v25.0", fetcher: fetcher as unknown as typeof fetch });

    for (let index = 1; index <= 3; index += 1) {
      await expect(processNormalizedFacebookEvent(
        commentEvent({ id: `evt_${index}`, commentId: `comment_${index}` }),
        repository,
        { client, tokenEncryptionKey: TOKEN_KEY },
      )).rejects.toBeInstanceOf(RetryableFacebookError);
      // Each one is a throttle strike; the third pauses the Page.
      expect((await checkAccountSendGate(PAGE)).status).toBe(index < 3 ? "open" : "throttled");
    }

    expect(fetcher).toHaveBeenCalledTimes(3);
    // Not recorded as a failed reply: the claim was given back and the ledger
    // row left retryable, so a later attempt posts it.
    expect(await repository.getExecution("workspace_a", `${automationId}:evt_1`)).toBeNull();
    expect(await repository.getOutboundDelivery(facebookReplyDeliveryKey(automationId, "evt_1")))
      .toMatchObject({ state: "FAILED", retryable: true });
  });

  it("honours Meta's own estimate from its usage headers on a throttled reply", async () => {
    const { repository } = await pageWithAutomation();
    const usage = { highestPercent: 100, regainAccessMs: 40 * 60_000 };
    const { client } = fakeClient({
      postCommentReply: vi.fn(async () => {
        throw new FacebookApiError("Calls to this api have exceeded the rate limit.", 400, true, true, 4, undefined, usage);
      }),
    });

    await expect(processNormalizedFacebookEvent(commentEvent(), repository, { client, tokenEncryptionKey: TOKEN_KEY }))
      .rejects.toBeInstanceOf(RetryableFacebookError);

    const gate = await checkAccountSendGate(PAGE);
    expect(gate.status).toBe("throttled");
    expect(gate.status === "throttled" && gate.until - Date.now()).toBe(40 * 60_000);
  });
});
