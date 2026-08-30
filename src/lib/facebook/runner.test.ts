import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { FacebookApiError, FacebookClient } from "./client";
import type { FacebookConnection, FacebookSendResult } from "./types";
import { processNormalizedFacebookEvent, RetryableFacebookError, isRetryableFacebookError } from "./runner";
import type { FacebookNormalizedEvent } from "./types";
import type { CommentTrigger, FlowDefinitionV1 } from "../automation/types";
import type { AutomationRepository } from "../repository";

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
