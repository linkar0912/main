import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowDefinition, FlowDefinitionV2, NormalizedEvent } from "./types";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { processNormalizedEvent, type AutomationRunnerClient } from "./runner";
import { MetaApiError, MetaClient } from "../meta/client";
import { resetAccountPauseStateForTests } from "./account-pause";
import { logger } from "../logger";

const flow: FlowDefinition = {
  version: 1,
  trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
  conditions: [],
  actions: [{ type: "private_reply", text: "Here is the guide" }],
};

// A comment that just arrived. Meta only accepts a private reply within 7 days
// of the comment, so this must be a live timestamp rather than a placeholder -
// with `timestamp: 1` (epoch) every private reply here is correctly refused.
const RECENT_COMMENT_AT = Date.now();

const event: NormalizedEvent = {
  id: "comment_1",
  accountId: "ig_1",
  type: "comment.created",
  text: "guide",
  commentId: "comment_1",
  recipientId: "person_1",
  timestamp: RECENT_COMMENT_AT,
};

const campaignDefinition: FlowDefinitionV2 = {
  version: 2,
  trigger: {
    type: "comment",
    source: "specific_media",
    mediaIds: ["media_1"],
    mediaSnapshots: [{
      id: "media_1",
      mediaType: "VIDEO",
      mediaProductType: "REELS",
      permalink: "https://www.instagram.com/reel/media_1",
      timestamp: "2026-08-21T09:00:00.000Z",
    }],
    match: "keyword",
    keywords: ["guide"],
  },
  publicReplies: [],
  openingMessage: { text: "Want the guide?", optInButtonLabel: "Get guide" },
  followGate: { required: true, notFollowingMessage: "Follow first", recheckButtonLabel: "I've followed" },
  delivery: { text: "Here is the guide", url: "https://example.com/protected" },
};

/** What the real Meta client throws when Graph throttles the account with this code on HTTP 400. */
async function metaThrottleError(code: number): Promise<MetaApiError> {
  const client = new MetaClient({
    apiVersion: "v25.0",
    fetcher: async () => new Response(JSON.stringify({
      error: { message: "There have been too many calls to this Instagram account. Wait a bit and try again.", code },
    }), { status: 400 }),
  });
  const error = await client.sendDirectMessage({ igUserId: "ig_1", accessToken: "token" }, "person_1", { type: "text", text: "x" })
    .catch((thrown: unknown) => thrown);
  if (!(error instanceof MetaApiError)) throw new Error("expected a MetaApiError");
  return error;
}

function createRunnerClient(overrides: Partial<AutomationRunnerClient> = {}): AutomationRunnerClient {
  return {
    sendPrivateReply: vi.fn().mockResolvedValue({ recipient_id: "person_1", message_id: "opening_1" }),
    sendDirectMessage: vi.fn().mockResolvedValue({ recipient_id: "person_1", message_id: "direct_1" }),
    replyToComment: vi.fn().mockResolvedValue({ id: "public_1" }),
    sendQuickReply: vi.fn().mockResolvedValue({ recipient_id: "person_1", message_id: "prompt_1" }),
    getUserFollowStatus: vi.fn().mockResolvedValue({ isUserFollowingBusiness: true }),
    getMedia: vi.fn().mockResolvedValue({
      id: "media_1",
      mediaType: "VIDEO",
      mediaProductType: "REELS",
      permalink: "https://www.instagram.com/reel/media_1",
      timestamp: "2026-08-21T09:00:00.000Z",
    }),
    ...overrides,
  };
}

function openingPostbackPayload(client: AutomationRunnerClient): string {
  const opening = vi.mocked(client.sendPrivateReply).mock.calls[0]?.[2];
  if (typeof opening !== "object" || opening === null || !Array.isArray(opening.buttons)) {
    throw new Error("opening postback button missing");
  }
  const button = opening.buttons.find((candidate) => candidate.type === "postback");
  if (!button || button.type !== "postback") throw new Error("opening postback button missing");
  return button.payload;
}

describe("automation runner", () => {
  it("tracks every inbound Instagram sender as a contact even when no automation matches", async () => {
    const repository = createMemoryRepository();
    await repository.ensureWorkspace("workspace_a", "owner@example.com", "user-1");
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: "sealed-token",
      status: "CONNECTED",
    });

    await processNormalizedEvent({
      id: "message_contact_1",
      accountId: "ig_1",
      type: "message.received",
      text: "Hello",
      recipientId: "person_1",
      timestamp: RECENT_COMMENT_AT,
    }, repository);

    expect(await repository.getContact("workspace_a", "ig_1", "person_1")).toMatchObject({
      igScopedUserId: "person_1",
      leadStatus: "NEW",
    });
  });

  it("does not dispatch work for a suspended workspace", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([{
      id: "automation_suspended",
      workspaceId: "workspace_suspended",
      name: "Suspended delivery",
      status: "ACTIVE",
      version: 1,
      priority: 0,
      definition: flow,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    }]);
    await repository.ensureWorkspace("workspace_suspended", "owner@example.com", "user-1");
    await repository.upsertConnection({
      workspaceId: "workspace_suspended",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
    await repository.setWorkspaceLifecycle("workspace_suspended", {
      status: "SUSPENDED",
      reason: "abuse review",
      actorUserId: "platform-owner",
      at: "2026-08-31T10:00:00.000Z",
    });
    const client = createRunnerClient();

    await expect(processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key }))
      .resolves.toEqual({ matched: 0, sent: 0, skipped: 0, failed: 0 });
    expect(client.sendPrivateReply).not.toHaveBeenCalled();
    expect(await repository.listRecentWebhookEvents("workspace_suspended", 10)).toEqual([]);
  });

  it("uses one targeted automation read and batches non-matching outcomes", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([
      {
        id: "automation_match",
        workspaceId: "workspace_a",
        name: "Matching guide",
        status: "ACTIVE",
        version: 1, priority: 10,
        definition: flow,
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString(),
      },
      {
        id: "automation_skip",
        workspaceId: "workspace_a",
        name: "Different keyword",
        status: "ACTIVE",
        version: 1, priority: 0,
        definition: {
          ...flow,
          trigger: { type: "comment", match: "keyword", keywords: ["pricing"], mediaIds: [] },
        },
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString(),
      },
    ]);
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
    const targetedRead = vi.spyOn(repository, "listActiveAutomationsForInstagramAccount");
    const broadRead = vi.spyOn(repository, "listAutomations");
    const preflightDedupe = vi.spyOn(repository, "hasExecution");
    const batchWrite = vi.spyOn(repository, "recordExecutions");

    await expect(processNormalizedEvent(event, repository, {
      client: createRunnerClient(),
      tokenEncryptionKey: key,
    })).resolves.toEqual({ matched: 1, sent: 1, skipped: 1, failed: 0 });

    expect(targetedRead).toHaveBeenCalledOnce();
    expect(targetedRead).toHaveBeenCalledWith("workspace_a", "ig_1");
    expect(broadRead).not.toHaveBeenCalled();
    expect(preflightDedupe).not.toHaveBeenCalled();
    expect(batchWrite).toHaveBeenCalledOnce();
    expect(batchWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        automationId: "automation_skip",
        dedupeKey: "automation_skip:comment_1",
        status: "SKIPPED",
      }),
    ]);
  });

  it("does not wait for webhook activity persistence before provider delivery", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([{
      id: "automation_fast_path",
      workspaceId: "workspace_a",
      name: "Fast path",
      status: "ACTIVE",
      version: 1, priority: 0,
      definition: flow,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    }]);
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
    let persistenceSettled = false;
    vi.spyOn(repository, "recordWebhookEvent").mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      persistenceSettled = true;
    });
    const sendPrivateReply = vi.fn().mockImplementation(async () => {
      expect(persistenceSettled).toBe(false);
      return { message_id: "message_fast" };
    });

    await expect(processNormalizedEvent(event, repository, {
      client: createRunnerClient({ sendPrivateReply }),
      tokenEncryptionKey: key,
    })).resolves.toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });

    expect(sendPrivateReply).toHaveBeenCalledOnce();
  });

  it("loads a conversational contact only once per event", async () => {
    const key = randomBytes(32).toString("hex");
    const captureFlow: FlowDefinition = {
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["guide"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Here is the guide" }],
      emailCapture: {
        promptText: "What is your email?",
        confirmationText: "You are in!",
      },
    };
    const repository = createMemoryRepository([{
      id: "automation_capture",
      workspaceId: "workspace_a",
      name: "Capture",
      status: "ACTIVE",
      version: 1, priority: 0,
      definition: captureFlow,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    }]);
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
    await repository.touchContact("workspace_a", "ig_1", "person_1", new Date(1).toISOString());
    const contactRead = vi.spyOn(repository, "getContact");

    await processNormalizedEvent({
      ...event,
      id: "message_contact_once",
      type: "message.received",
      text: "guide",
    }, repository, {
      client: createRunnerClient(),
      tokenEncryptionKey: key,
    });

    expect(contactRead).toHaveBeenCalledOnce();
  });

  it("delivers a matching action and deduplicates the webhook event", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([
      {
        id: "automation_1",
        workspaceId: "workspace_a",
        name: "Guide delivery",
        status: "ACTIVE",
        version: 1, priority: 0,
        definition: flow,
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString(),
      },
    ]);
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
    const client = createRunnerClient({
      sendPrivateReply: vi.fn().mockResolvedValue({ message_id: "message_1" }),
    });

    const first = await processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key });
    const second = await processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key });

    expect(first).toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });
    expect(second).toEqual({ matched: 0, sent: 0, skipped: 0, failed: 0 });
    expect(client.sendPrivateReply).toHaveBeenCalledWith(
      { igUserId: "ig_1", accessToken: "access-token" },
      "comment_1",
      "Here is the guide",
    );
  });

  it("leaves retryable Meta failures unrecorded so the queue can retry", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([{ id: "automation_retry", workspaceId: "workspace_a", name: "Retry delivery", status: "ACTIVE", version: 1, priority: 0, definition: flow, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() }]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({
      sendPrivateReply: vi.fn()
        .mockRejectedValueOnce(new MetaApiError("rate limited", 429))
        .mockResolvedValueOnce({ message_id: "message_retry" }),
    });

    // A throttled send may surface as Meta's own error or as Linkar's cool-down
    // wait; either way the queue sees a retryable failure.
    await expect(processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key })).rejects.toMatchObject({ retryable: true });
    await expect(processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key })).resolves.toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(2);
  });

  it("retries only the failed classic action instead of replaying earlier sends", async () => {
    const key = randomBytes(32).toString("hex");
    const multiActionFlow: FlowDefinition = {
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [
        { type: "send_text", text: "first" },
        { type: "send_text", text: "second" },
      ],
    };
    const repository = createMemoryRepository([{
      id: "automation_multi_action",
      workspaceId: "workspace_a",
      name: "Multi action",
      status: "ACTIVE",
      version: 1, priority: 0,
      definition: multiActionFlow,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    }]);
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
    const sendDirectMessage = vi.fn()
      .mockResolvedValueOnce({ message_id: "one" })
      .mockRejectedValueOnce(new MetaApiError("rate limited", 429))
      .mockResolvedValueOnce({ message_id: "two" });
    const client = createRunnerClient({ sendDirectMessage });
    const message = {
      id: "message_multi_action",
      accountId: "ig_1",
      type: "message.received" as const,
      text: "hello",
      recipientId: "person_1",
      timestamp: RECENT_COMMENT_AT,
    };

    await expect(processNormalizedEvent(message, repository, {
      client,
      tokenEncryptionKey: key,
    })).rejects.toMatchObject({ retryable: true });
    await expect(processNormalizedEvent(message, repository, {
      client,
      tokenEncryptionKey: key,
    })).resolves.toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });

    expect(sendDirectMessage.mock.calls.map((call) => (call[2] as { text: string }).text))
      .toEqual(["first", "second", "second"]);
  });

  it("caps concurrent classic events by outbound message count", async () => {
    const key = randomBytes(32).toString("hex");
    const limitedFlow: FlowDefinition = {
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [
        { type: "send_text", text: "first" },
        { type: "send_text", text: "second" },
      ],
      dailySendLimit: 3,
    };
    const repository = createMemoryRepository([{
      id: "automation_limited",
      workspaceId: "workspace_a",
      name: "Limited multi action",
      status: "ACTIVE",
      version: 1, priority: 0,
      definition: limitedFlow,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    }]);
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
    const sendDirectMessage = vi.fn().mockResolvedValue({ message_id: "sent" });
    const client = createRunnerClient({ sendDirectMessage });
    const message = (id: string) => ({
      id,
      accountId: "ig_1",
      type: "message.received" as const,
      text: "hello",
      recipientId: `person_${id}`,
      timestamp: RECENT_COMMENT_AT,
    });

    await Promise.all([
      processNormalizedEvent(message("a"), repository, { client, tokenEncryptionKey: key }),
      processNormalizedEvent(message("b"), repository, { client, tokenEncryptionKey: key }),
    ]);

    expect(sendDirectMessage).toHaveBeenCalledTimes(3);
  });

  it("records a retryable delivery failure only on the final queue attempt", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([{ id: "automation_final", workspaceId: "workspace_a", name: "Final attempt", status: "ACTIVE", version: 1, priority: 0, definition: flow, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() }]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({ sendPrivateReply: vi.fn().mockRejectedValue(new MetaApiError("temporarily unavailable", 503)) });

    await expect(processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key, finalAttempt: true })).resolves.toEqual({ matched: 1, sent: 0, skipped: 0, failed: 1 });
    await expect(processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key, finalAttempt: true })).resolves.toEqual({ matched: 0, sent: 0, skipped: 0, failed: 0 });
  });

  describe.each([80002, 80006])("when Meta throttles a send with code %i", (code) => {
    // Each throttle counts toward the account's cool-down, kept in this
    // process's memory without Redis; start and end every case with none.
    beforeEach(() => resetAccountPauseStateForTests());
    afterEach(() => resetAccountPauseStateForTests());

    it("retries the classic action it stopped on, without sending an earlier action twice", async () => {
      const key = randomBytes(32).toString("hex");
      const throttle = await metaThrottleError(code);
      expect(throttle).toMatchObject({ status: 400, code, retryable: true });
      const repository = createMemoryRepository([{
        id: "automation_throttled",
        workspaceId: "workspace_a",
        name: "Throttled",
        status: "ACTIVE",
        version: 1, priority: 0,
        definition: {
          version: 1,
          trigger: { type: "message", match: "any", keywords: [] },
          conditions: [],
          actions: [{ type: "send_text", text: "first" }, { type: "send_text", text: "second" }],
        },
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString(),
      }]);
      await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
      const sendDirectMessage = vi.fn()
        .mockResolvedValueOnce({ message_id: "one" })
        .mockRejectedValueOnce(throttle)
        .mockResolvedValueOnce({ message_id: "two" });
      const client = createRunnerClient({ sendDirectMessage });
      const message: NormalizedEvent = {
        id: `message_throttled_${code}`,
        accountId: "ig_1",
        type: "message.received",
        text: "hello",
        recipientId: "person_1",
        timestamp: RECENT_COMMENT_AT,
      };

      await expect(processNormalizedEvent(message, repository, { client, tokenEncryptionKey: key }))
        .rejects.toMatchObject({ retryable: true });
      await expect(processNormalizedEvent(message, repository, { client, tokenEncryptionKey: key }))
        .resolves.toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });

      // The delivery ledger keys each action, so the retry only repeats the one Meta refused.
      expect(sendDirectMessage.mock.calls.map((call) => (call[2] as { text: string }).text))
        .toEqual(["first", "second", "second"]);
    });

    it("retries an email capture confirmation once, without failing the reply", async () => {
      const key = randomBytes(32).toString("hex");
      const throttle = await metaThrottleError(code);
      const repository = createMemoryRepository([{
        id: "automation_capture",
        workspaceId: "workspace_a",
        name: "Capture",
        status: "ACTIVE",
        version: 1, priority: 0,
        definition: {
          version: 1,
          trigger: { type: "message", match: "keyword", keywords: ["guide"] },
          conditions: [],
          actions: [{ type: "send_text", text: "Here comes the guide!" }],
          emailCapture: { promptText: "What is your email?", confirmationText: "You are in!" },
        },
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString(),
      }]);
      await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
      let refused = false;
      const sendDirectMessage = vi.fn(async (_connection: unknown, _recipient: string, outgoing: { text?: string }) => {
        if (outgoing.text === "You are in!" && !refused) {
          refused = true;
          throw throttle;
        }
        return { recipient_id: "person_1", message_id: `direct_${sendDirectMessage.mock.calls.length}` };
      });
      const client = createRunnerClient({ sendDirectMessage: sendDirectMessage as AutomationRunnerClient["sendDirectMessage"] });
      const base = { accountId: "ig_1", type: "message.received" as const, recipientId: "person_1", timestamp: RECENT_COMMENT_AT };
      await processNormalizedEvent({ ...base, id: `capture_start_${code}`, text: "guide" }, repository, { client, tokenEncryptionKey: key });
      const reply: NormalizedEvent = { ...base, id: `capture_reply_${code}`, text: "it is jane@example.com" };

      await expect(processNormalizedEvent(reply, repository, { client, tokenEncryptionKey: key }))
        .rejects.toMatchObject({ retryable: true });
      await expect(processNormalizedEvent(reply, repository, { client, tokenEncryptionKey: key }))
        .resolves.toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });

      const confirmations = sendDirectMessage.mock.calls.filter((call) => call[2].text === "You are in!");
      expect(confirmations).toHaveLength(2);
      const executions = await repository.listAutomationExecutions("workspace_a", "automation_capture", 20);
      expect(executions.filter((execution) => execution.reason === "email_captured")).toHaveLength(1);
      expect(executions.some((execution) => execution.status === "FAILED")).toBe(false);
    });
  });

  it("runs only the newest matching version 2 campaign and consumes the comment before version 1", async () => {
    const key = randomBytes(32).toString("hex");
    const olderCampaign = {
      id: "campaign_older",
      workspaceId: "workspace_a",
      name: "Older campaign",
      status: "ACTIVE" as const,
      version: 2, priority: 0,
      definition: campaignDefinition,
      createdAt: "2026-08-21T08:00:00.000Z",
      updatedAt: "2026-08-21T09:00:00.000Z",
    };
    const newerCampaign = {
      ...olderCampaign,
      id: "campaign_newer",
      name: "Newer campaign",
      updatedAt: "2026-08-21T10:00:00.000Z",
    };
    const legacy = {
      id: "legacy_overlap",
      workspaceId: "workspace_a",
      name: "Legacy overlap",
      status: "ACTIVE" as const,
      version: 1, priority: 0,
      definition: flow,
      createdAt: "2026-08-21T08:00:00.000Z",
      updatedAt: "2026-08-21T11:00:00.000Z",
    };
    const repository = createMemoryRepository([olderCampaign, newerCampaign, legacy]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient();
    const campaignEvent = { ...event, mediaId: "media_1", timestamp: Date.parse("2026-08-21T10:01:00.000Z") };

    // Process the comment moments after it was made, inside Meta's 7-day
    // private reply window, whatever today's date is.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-08-21T10:02:00.000Z"));
    let result: Awaited<ReturnType<typeof processNormalizedEvent>>;
    try {
      result = await processNormalizedEvent(campaignEvent, repository, {
        client,
        tokenEncryptionKey: key,
        interactionSecret: "app-secret",
        campaignsEnabled: true,
      });
    } finally {
      vi.useRealTimers();
    }

    expect(result).toMatchObject({ handled: true, matched: 1, sent: 1 });
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(await repository.listParticipants("workspace_a", "campaign_newer", 10)).toHaveLength(1);
    expect(await repository.listParticipants("workspace_a", "campaign_older", 10)).toHaveLength(0);
    expect(await repository.hasExecution("workspace_a", "legacy_overlap:comment_1")).toBe(false);
  });

  it("resumes the source-comment uniqueness winner with its original campaign definition", async () => {
    const key = randomBytes(32).toString("hex");
    const originalDefinition: FlowDefinitionV2 = {
      ...campaignDefinition,
      openingMessage: { ...campaignDefinition.openingMessage, text: "Original opening" },
    };
    const updatedDefinition: FlowDefinitionV2 = {
      ...campaignDefinition,
      openingMessage: { ...campaignDefinition.openingMessage, text: "Newer campaign opening" },
    };
    const original = { id: "campaign_original", workspaceId: "workspace_a", name: "Original", status: "ACTIVE" as const, version: 2, priority: 0, definition: originalDefinition, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() };
    const newer = { id: "campaign_newer_retry", workspaceId: "workspace_a", name: "Newer", status: "ACTIVE" as const, version: 2, priority: 0, definition: updatedDefinition, createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const repository = createMemoryRepository([original, newer]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    await repository.createParticipant({
      workspaceId: "workspace_a",
      automationId: original.id,
      instagramAccountId: "ig_1",
      sourceCommentId: "comment_1",
      sourceMediaId: "media_1",
      sourceMediaSnapshot: campaignDefinition.trigger.mediaSnapshots[0]!,
      publicReplyStatus: "SENT",
      publicReplyProviderId: "public_original",
    });
    const client = createRunnerClient();

    const result = await processNormalizedEvent({ ...event, mediaId: "media_1" }, repository, {
      client,
      tokenEncryptionKey: key,
      interactionSecret: "app-secret",
      campaignsEnabled: true,
    });

    expect(result).toMatchObject({ handled: true, sent: 1 });
    expect(client.sendPrivateReply).toHaveBeenCalledWith(
      { igUserId: "ig_1", accessToken: "access-token" },
      "comment_1",
      expect.objectContaining({ text: "Original opening" }),
    );
    expect(await repository.listParticipants("workspace_a", original.id, 10)).toHaveLength(1);
    expect(await repository.listParticipants("workspace_a", newer.id, 10)).toHaveLength(0);
  });

  async function sourceWinnerAfterEdit(status: "ACTIVE" | "PAUSED") {
    const key = randomBytes(32).toString("hex");
    const editedDefinition: FlowDefinitionV2 = {
      ...campaignDefinition,
      trigger: {
        ...campaignDefinition.trigger,
        mediaIds: ["media_other"],
        mediaSnapshots: [{ ...campaignDefinition.trigger.mediaSnapshots[0]!, id: "media_other" }],
      },
      openingMessage: { ...campaignDefinition.openingMessage, text: "Recovered source winner" },
    };
    const original = {
      id: "campaign_edited_source",
      workspaceId: "workspace_a",
      name: "Edited original",
      status,
      version: 2, priority: 0,
      definition: editedDefinition,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(3).toISOString(),
    };
    const legacy = {
      id: "legacy_source_replay",
      workspaceId: "workspace_a",
      name: "Legacy overlap",
      status: "ACTIVE" as const,
      version: 1, priority: 0,
      definition: flow,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(2).toISOString(),
    };
    const repository = createMemoryRepository([original, legacy]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    await repository.createParticipant({
      workspaceId: "workspace_a",
      automationId: original.id,
      instagramAccountId: "ig_1",
      sourceCommentId: "comment_1",
      sourceMediaId: "media_1",
      sourceMediaSnapshot: campaignDefinition.trigger.mediaSnapshots[0]!,
      publicReplyStatus: "SENT",
      publicReplyProviderId: "public_original",
    });
    const client = createRunnerClient();

    const result = await processNormalizedEvent({ ...event, mediaId: "media_1" }, repository, {
      client,
      tokenEncryptionKey: key,
      interactionSecret: "app-secret",
      campaignsEnabled: true,
    });
    const [participant] = await repository.listParticipants("workspace_a", original.id, 10);
    return { client, repository, result, participant };
  }

  it("recovers an existing source winner before V1 after its V2 campaign is edited", async () => {
    const { client, repository, result } = await sourceWinnerAfterEdit("ACTIVE");

    expect(result).toMatchObject({ handled: true, sent: 1 });
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(client.sendPrivateReply).toHaveBeenCalledWith(
      { igUserId: "ig_1", accessToken: "access-token" },
      "comment_1",
      expect.objectContaining({ text: "Recovered source winner" }),
    );
    expect(await repository.hasExecution("workspace_a", "legacy_source_replay:comment_1")).toBe(false);
  });

  it("sends nothing for an existing source winner whose V2 campaign was paused, and still keeps V1 off the comment", async () => {
    const { client, repository, result, participant } = await sourceWinnerAfterEdit("PAUSED");

    expect(result).toMatchObject({ handled: true, sent: 0, skipped: 1, failed: 0 });
    expect(client.sendPrivateReply).not.toHaveBeenCalled();
    expect(client.replyToComment).not.toHaveBeenCalled();
    // Left as it was, for the hourly sweep to expire.
    expect(participant).toMatchObject({ state: "COMMENT_MATCHED", openingStatus: "PENDING" });
    expect(await repository.hasExecution("workspace_a", "legacy_source_replay:comment_1")).toBe(false);
  });

  it("falls back to version 1 unchanged when no enabled version 2 campaign matches", async () => {
    const key = randomBytes(32).toString("hex");
    const nonMatchingCampaign = {
      id: "campaign_nonmatch",
      workspaceId: "workspace_a",
      name: "Different media",
      status: "ACTIVE" as const,
      version: 2, priority: 0,
      definition: {
        ...campaignDefinition,
        trigger: {
          ...campaignDefinition.trigger,
          mediaIds: ["media_other"],
          mediaSnapshots: [{ ...campaignDefinition.trigger.mediaSnapshots[0], id: "media_other" }],
        },
      },
      createdAt: "2026-08-21T08:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    };
    const legacy = { id: "legacy_fallback", workspaceId: "workspace_a", name: "Legacy", status: "ACTIVE" as const, version: 1, priority: 0, definition: flow, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() };
    const repository = createMemoryRepository([nonMatchingCampaign, legacy]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({ sendPrivateReply: vi.fn().mockResolvedValue({ message_id: "legacy_message" }) });

    await expect(processNormalizedEvent({ ...event, mediaId: "media_1" }, repository, {
      client,
      tokenEncryptionKey: key,
      interactionSecret: "app-secret",
      campaignsEnabled: true,
    })).resolves.toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });
    expect(client.sendPrivateReply).toHaveBeenCalledWith(
      { igUserId: "ig_1", accessToken: "access-token" },
      "comment_1",
      "Here is the guide",
    );
  });

  it("keeps version 2 disabled by default while version 1 remains operational", async () => {
    const key = randomBytes(32).toString("hex");
    const campaign = { id: "campaign_disabled", workspaceId: "workspace_a", name: "Disabled campaign", status: "ACTIVE" as const, version: 2, priority: 0, definition: campaignDefinition, createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const legacy = { id: "legacy_enabled", workspaceId: "workspace_a", name: "Legacy", status: "ACTIVE" as const, version: 1, priority: 0, definition: flow, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() };
    const repository = createMemoryRepository([campaign, legacy]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({ sendPrivateReply: vi.fn().mockResolvedValue({ message_id: "legacy_message" }) });

    await processNormalizedEvent({ ...event, mediaId: "media_1" }, repository, { client, tokenEncryptionKey: key, interactionSecret: "app-secret" });

    expect(await repository.listParticipants("workspace_a", "campaign_disabled", 10)).toHaveLength(0);
    expect(client.sendPrivateReply).toHaveBeenCalledWith(
      { igUserId: "ig_1", accessToken: "access-token" },
      "comment_1",
      "Here is the guide",
    );
  });

  it("fails a matched version 2 campaign visibly when the interaction secret is absent", async () => {
    const key = randomBytes(32).toString("hex");
    const campaign = { id: "campaign_no_secret", workspaceId: "workspace_a", name: "No secret", status: "ACTIVE" as const, version: 2, priority: 0, definition: campaignDefinition, createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const repository = createMemoryRepository([campaign]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient();

    const result = await processNormalizedEvent({ ...event, mediaId: "media_1" }, repository, {
      client,
      tokenEncryptionKey: key,
      campaignsEnabled: true,
    });

    expect(result).toMatchObject({ handled: true, matched: 1, sent: 0, failed: 1 });
    expect(client.replyToComment).not.toHaveBeenCalled();
    expect(client.sendPrivateReply).not.toHaveBeenCalled();
  });

  it("does not bind next-media campaigns to media published at or before activation", async () => {
    const key = randomBytes(32).toString("hex");
    const nextDefinition: FlowDefinitionV2 = {
      ...campaignDefinition,
      trigger: { ...campaignDefinition.trigger, source: "next_media", mediaIds: [], mediaSnapshots: [] },
    };
    const campaign = { id: "campaign_next", workspaceId: "workspace_a", name: "Next Reel", status: "ACTIVE" as const, version: 2, priority: 0, definition: nextDefinition, activatedAt: "2026-08-21T10:00:00.000Z", createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const repository = createMemoryRepository([campaign]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({ getMedia: vi.fn().mockResolvedValue({ id: "media_old", mediaType: "VIDEO", mediaProductType: "REELS", permalink: "https://www.instagram.com/reel/media_old", timestamp: "2026-08-21T11:00:00.000+02:00" }) });

    const result = await processNormalizedEvent({ ...event, mediaId: "media_old" }, repository, {
      client,
      tokenEncryptionKey: key,
      interactionSecret: "app-secret",
      campaignsEnabled: true,
    });

    expect(result).toEqual({ matched: 0, sent: 0, skipped: 0, failed: 0 });
    expect((await repository.getAutomation("workspace_a", campaign.id))?.boundMediaId).toBeUndefined();
    expect(client.sendPrivateReply).not.toHaveBeenCalled();
  });

  it("does not bind next-media when publication is exactly equal to activation", async () => {
    const key = randomBytes(32).toString("hex");
    const nextDefinition: FlowDefinitionV2 = {
      ...campaignDefinition,
      trigger: { ...campaignDefinition.trigger, source: "next_media", mediaIds: [], mediaSnapshots: [] },
    };
    const campaign = { id: "campaign_next_equal", workspaceId: "workspace_a", name: "Next Reel equality", status: "ACTIVE" as const, version: 2, priority: 0, definition: nextDefinition, activatedAt: "2026-08-21T10:00:00.000Z", createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const repository = createMemoryRepository([campaign]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({
      getMedia: vi.fn().mockResolvedValue({ id: "media_equal", mediaType: "VIDEO", mediaProductType: "REELS", permalink: "https://www.instagram.com/reel/media_equal", timestamp: campaign.activatedAt }),
    });

    await expect(processNormalizedEvent({ ...event, mediaId: "media_equal" }, repository, {
      client,
      tokenEncryptionKey: key,
      interactionSecret: "app-secret",
      campaignsEnabled: true,
    })).resolves.toEqual({ matched: 0, sent: 0, skipped: 0, failed: 0 });
    expect((await repository.getAutomation("workspace_a", campaign.id))?.boundMediaId).toBeUndefined();
    expect(client.sendPrivateReply).not.toHaveBeenCalled();
  });

  it("atomically binds one competing post-activation media event and only that event continues", async () => {
    const key = randomBytes(32).toString("hex");
    const nextDefinition: FlowDefinitionV2 = {
      ...campaignDefinition,
      trigger: { ...campaignDefinition.trigger, source: "next_media", mediaIds: [], mediaSnapshots: [] },
    };
    const campaign = { id: "campaign_next_race", workspaceId: "workspace_a", name: "Next Reel", status: "ACTIVE" as const, version: 2, priority: 0, definition: nextDefinition, activatedAt: "2026-08-21T10:00:00.000Z", createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const repository = createMemoryRepository([campaign]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({
      getMedia: vi.fn().mockImplementation(async (_connection, mediaId: string) => ({
        id: mediaId,
        mediaType: "VIDEO" as const,
        mediaProductType: "REELS" as const,
        permalink: `https://www.instagram.com/reel/${mediaId}`,
        timestamp: "2026-08-21T10:00:00.001Z",
      })),
    });
    const first = { ...event, id: "comment_next_1", commentId: "comment_next_1", mediaId: "media_next_1" };
    const second = { ...event, id: "comment_next_2", commentId: "comment_next_2", mediaId: "media_next_2" };

    await Promise.all([
      processNormalizedEvent(first, repository, { client, tokenEncryptionKey: key, interactionSecret: "app-secret", campaignsEnabled: true }),
      processNormalizedEvent(second, repository, { client, tokenEncryptionKey: key, interactionSecret: "app-secret", campaignsEnabled: true }),
    ]);

    const boundMediaId = (await repository.getAutomation("workspace_a", campaign.id))?.boundMediaId;
    expect(["media_next_1", "media_next_2"]).toContain(boundMediaId);
    const participants = await repository.listParticipants("workspace_a", campaign.id, 10);
    expect(participants).toHaveLength(1);
    expect(participants[0]?.sourceMediaId).toBe(boundMediaId);
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
  });

  it("handles signed campaign interactions before generic version 1 postback rules", async () => {
    const key = randomBytes(32).toString("hex");
    const campaign = { id: "campaign_interaction", workspaceId: "workspace_a", name: "Campaign", status: "ACTIVE" as const, version: 2, priority: 0, definition: campaignDefinition, createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const messageFlow: FlowDefinition = {
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [{ type: "send_text", text: "Legacy postback response" }],
    };
    const legacy = { id: "legacy_postback", workspaceId: "workspace_a", name: "Legacy", status: "ACTIVE" as const, version: 1, priority: 0, definition: messageFlow, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() };
    const repository = createMemoryRepository([campaign, legacy]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({ getUserFollowStatus: vi.fn().mockResolvedValue({ isUserFollowingBusiness: false }) });
    await processNormalizedEvent({ ...event, mediaId: "media_1", timestamp: Date.now() }, repository, { client, tokenEncryptionKey: key, interactionSecret: "app-secret", campaignsEnabled: true });
    const openingPayload = openingPostbackPayload(client);

    await processNormalizedEvent({
      id: "postback_1",
      accountId: "ig_1",
      type: "postback.received",
      text: "legacy would match",
      recipientId: "person_1",
      interactionPayload: openingPayload,
      timestamp: Date.now() + 1_000,
    }, repository, { client, tokenEncryptionKey: key, interactionSecret: "app-secret", campaignsEnabled: true });

    expect(client.sendQuickReply).not.toHaveBeenCalled();
    expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(await repository.hasExecution("workspace_a", "legacy_postback:postback_1")).toBe(false);
  });

  it.each([
    ["invalid signature character", (payload: string) => `${payload}!`, "invalid_signature"],
    ["extra separator", (payload: string) => `${payload}.extra`, "extra_separator"],
  ])("consumes a campaign interaction with %s before generic V1 message handling", async (
    _case,
    corruptPayload,
    eventSuffix,
  ) => {
    const key = randomBytes(32).toString("hex");
    const campaign = { id: "campaign_invalid_interaction", workspaceId: "workspace_a", name: "Campaign", status: "ACTIVE" as const, version: 2, priority: 0, definition: campaignDefinition, createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const messageFlow: FlowDefinition = {
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [{ type: "send_text", text: "Legacy must not run" }],
    };
    const legacy = { id: "legacy_invalid_campaign_payload", workspaceId: "workspace_a", name: "Legacy", status: "ACTIVE" as const, version: 1, priority: 0, definition: messageFlow, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() };
    const repository = createMemoryRepository([campaign, legacy]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient();
    await processNormalizedEvent({ ...event, mediaId: "media_1", timestamp: Date.now() }, repository, { client, tokenEncryptionKey: key, interactionSecret: "app-secret", campaignsEnabled: true });
    const openingPayload = openingPostbackPayload(client);
    const interactionId = `postback_${eventSuffix}`;

    const result = await processNormalizedEvent({
      id: interactionId,
      accountId: "ig_1",
      type: "postback.received",
      text: "legacy would match",
      recipientId: "person_1",
      interactionPayload: corruptPayload(openingPayload),
      timestamp: Date.now() + 1_000,
    }, repository, { client, tokenEncryptionKey: key, interactionSecret: "app-secret", campaignsEnabled: true });

    expect(result).toMatchObject({ handled: true, failed: 1 });
    expect(client.sendDirectMessage).not.toHaveBeenCalled();
    expect(await repository.hasExecution(
      "workspace_a",
      `legacy_invalid_campaign_payload:${interactionId}`,
    )).toBe(false);
  });

  it("refuses a private reply to a comment older than Meta's 7-day window", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([{
      id: "automation_stale_comment",
      workspaceId: "workspace_a",
      name: "Stale comment",
      status: "ACTIVE",
      version: 1,
      priority: 0,
      definition: flow,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    }]);
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
    const client = createRunnerClient();
    // 8 days old: Meta rejects the private reply outright, so we must not spend
    // an API call (or a failed-send signal against the account) attempting it.
    const staleEvent = {
      ...event,
      id: "comment_stale",
      commentId: "comment_stale",
      timestamp: Date.now() - 8 * 24 * 60 * 60 * 1_000,
    };

    const result = await processNormalizedEvent(staleEvent, repository, {
      client,
      tokenEncryptionKey: key,
    });

    expect(client.sendPrivateReply).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it("sends only one private reply when two automations match the same comment", async () => {
    const key = randomBytes(32).toString("hex");
    const commentFlow: FlowDefinition = {
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "here you go" }],
    };
    const repository = createMemoryRepository([
      {
        id: "automation_first",
        workspaceId: "workspace_a",
        name: "First",
        status: "ACTIVE",
        version: 1,
        priority: 0,
        definition: commentFlow,
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString(),
      },
      {
        id: "automation_second",
        workspaceId: "workspace_a",
        name: "Second",
        status: "ACTIVE",
        version: 1,
        priority: 1,
        definition: commentFlow,
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString(),
      },
    ]);
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
    const client = createRunnerClient();

    // Meta permits exactly one private reply per comment - the second matching
    // flow must stand down rather than DM the same person again.
    await processNormalizedEvent({
      ...event,
      id: "comment_shared",
      commentId: "comment_shared",
    }, repository, { client, tokenEncryptionKey: key });

    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
  });

  it("names the automation when a saved regex keyword no longer compiles, in the story-reply pre-pass and the main loop", async () => {
    const key = randomBytes(32).toString("hex");
    const regexAutomation = (id: string, definition: FlowDefinition) => ({
      id,
      workspaceId: "workspace_a",
      name: id,
      status: "ACTIVE" as const,
      version: 1,
      priority: 0,
      definition,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    });
    // Lookbehinds were saved before the matcher's rules and can no longer run.
    const repository = createMemoryRepository([
      regexAutomation("automation_story_regex_legacy", {
        version: 1,
        trigger: { type: "story_reply", match: "keyword", mode: "regex", keywords: ["(?<!not )runner-story-legacy"] },
        conditions: [],
        actions: [{ type: "send_text", text: "Story reply" }],
      }),
      regexAutomation("automation_dm_regex_legacy", {
        version: 1,
        trigger: { type: "message", match: "keyword", mode: "regex", keywords: ["(?<!not )runner-dm-legacy"] },
        conditions: [],
        actions: [{ type: "send_text", text: "DM reply" }],
      }),
    ]);
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
    const client = createRunnerClient();
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    try {
      await processNormalizedEvent({
        id: "story_reply_regex_legacy",
        accountId: "ig_1",
        type: "message.received",
        text: "loved this story",
        recipientId: "person_regex",
        storyId: "story_1",
        timestamp: RECENT_COMMENT_AT,
      }, repository, { client, tokenEncryptionKey: key });

      const unsupported = warn.mock.calls.filter(([message]) => String(message).startsWith("A regex automation has a keyword"));
      // The story-reply flow warns from the pre-pass (once, not again in the
      // main loop); the message flow warns from the main loop.
      expect(unsupported.map(([, context]) => context?.automationId)).toEqual([
        "automation_story_regex_legacy",
        "automation_dm_regex_legacy",
      ]);
      expect(unsupported[0][1]).toMatchObject({ accountId: "ig_1", triggerType: "story_reply", keywordIndexes: [0] });
      expect(unsupported[1][1]).toMatchObject({ accountId: "ig_1", triggerType: "message", keywordIndexes: [0] });
      // The pattern text itself never reaches the log.
      expect(JSON.stringify(unsupported)).not.toMatch(/runner-(story|dm)-legacy/);
      expect(client.sendDirectMessage).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("automation runner read-ahead", () => {
  function automationIn(workspaceId: string, id: string, text: string) {
    return {
      id,
      workspaceId,
      name: id,
      status: "ACTIVE" as const,
      version: 1,
      priority: 0,
      definition: { ...flow, actions: [{ type: "private_reply" as const, text }] } as FlowDefinition,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    };
  }

  async function connect(repository: ReturnType<typeof createMemoryRepository>, workspaceId: string, key: string) {
    await repository.ensureWorkspace(workspaceId, `owner@${workspaceId}.test`, `user-${workspaceId}`);
    await repository.upsertConnection({
      workspaceId,
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
  }

  it("re-reads everything when the account has moved to another workspace since it was last seen", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([
      automationIn("workspace_old", "automation_old", "Old workspace reply"),
      automationIn("workspace_new", "automation_new", "New workspace reply"),
    ]);
    await connect(repository, "workspace_old", key);
    const client = createRunnerClient();
    await processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key });
    expect(vi.mocked(client.sendPrivateReply).mock.calls[0]?.[2]).toBe("Old workspace reply");

    await repository.deleteConnectionByInstagramAccount("ig_1");
    await connect(repository, "workspace_new", key);
    const statusRead = vi.spyOn(repository, "getWorkspaceStatus");
    await processNormalizedEvent({ ...event, id: "comment_2", commentId: "comment_2", recipientId: "person_2" }, repository, {
      client,
      tokenEncryptionKey: key,
    });

    // The read-ahead used the old workspace; its answers were thrown away.
    expect(statusRead.mock.calls.map(([workspaceId]) => workspaceId)).toEqual(["workspace_old", "workspace_new"]);
    expect(vi.mocked(client.sendPrivateReply).mock.calls[1]?.[2]).toBe("New workspace reply");
    expect(await repository.listAutomationExecutions("workspace_old", "automation_old", 10)).toHaveLength(1);
  });

  it("reads gatekeeping state fresh on every event, so a suspension stops the very next reply", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([automationIn("workspace_a", "automation_a", "Hello")]);
    await connect(repository, "workspace_a", key);
    const client = createRunnerClient();
    await processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key });
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);

    await repository.setWorkspaceLifecycle("workspace_a", {
      status: "SUSPENDED",
      reason: "abuse review",
      actorUserId: "platform-owner",
      at: "2026-08-31T10:00:00.000Z",
    });
    await expect(processNormalizedEvent({ ...event, id: "comment_2", commentId: "comment_2" }, repository, {
      client,
      tokenEncryptionKey: key,
    })).resolves.toEqual({ matched: 0, sent: 0, skipped: 0, failed: 0 });
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
  });

  it("fails the job when the contact touch that ran alongside the reply fails, and the retry does not reply twice", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([{
      ...automationIn("workspace_a", "automation_dm", "unused"),
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["price"] },
        conditions: [],
        actions: [{ type: "send_text", text: "Prices start at 499" }],
      } as FlowDefinition,
    }]);
    await connect(repository, "workspace_a", key);
    const touch = vi.spyOn(repository, "touchContact").mockRejectedValueOnce(new Error("database unavailable"));
    const client = createRunnerClient();
    const message: NormalizedEvent = {
      id: "mid_1",
      accountId: "ig_1",
      type: "message.received",
      text: "price?",
      recipientId: "person_1",
      timestamp: RECENT_COMMENT_AT,
    };

    await expect(processNormalizedEvent(message, repository, { client, tokenEncryptionKey: key }))
      .rejects.toThrow("database unavailable");
    expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);

    await processNormalizedEvent(message, repository, { client, tokenEncryptionKey: key });
    expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(touch).toHaveBeenCalledTimes(2);
    expect(await repository.getContact("workspace_a", "ig_1", "person_1")).toMatchObject({ igScopedUserId: "person_1" });
  });
});
