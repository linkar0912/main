import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { normalizeWebhook } from "../meta/webhooks";
import { sealSecret } from "../security/secrets";
import { validateFlowDefinition } from "./definition";
import { matchesTrigger } from "./match";
import { processNormalizedEvent } from "./runner";
import type { FlowDefinitionV1, NormalizedEvent } from "./types";

vi.mock("../repository-provider", () => ({ getRepository: vi.fn() }));

const ACCOUNT = "ig_business";
const PERSON = "igsid_person";
const TOKEN_KEY = "d".repeat(64);
const NOW = Date.parse("2026-09-27T10:00:00.000Z");

const storyReplyFlow = (keywords: string[] = ["link"]): FlowDefinitionV1 => ({
  version: 1,
  trigger: { type: "story_reply", match: keywords.length ? "keyword" : "any", keywords },
  conditions: [],
  actions: [{ type: "send_text", text: "Here is the Story link" }],
});
const anyMessageFlow: FlowDefinitionV1 = {
  version: 1,
  trigger: { type: "message", match: "any", keywords: [] },
  conditions: [],
  actions: [{ type: "send_text", text: "Thanks for your message" }],
};
const storyReply = (text: string, id = "mid_1"): NormalizedEvent => ({
  id, accountId: ACCOUNT, type: "message.received", text, recipientId: PERSON, timestamp: NOW, storyId: "story_1",
});

describe("story reply trigger", () => {
  it("tags a DM that replies to a Story with the story id and keeps it a message", () => {
    const [event] = normalizeWebhook({
      object: "instagram",
      entry: [{
        id: ACCOUNT,
        time: NOW,
        messaging: [{
          sender: { id: PERSON },
          recipient: { id: ACCOUNT },
          timestamp: NOW,
          message: { mid: "mid_1", text: "link please", reply_to: { story: { id: "story_1", url: "https://cdn.example/story" } } },
        }],
      }],
    });
    expect(event).toMatchObject({ type: "message.received", text: "link please", storyId: "story_1" });
  });

  it("matches only Story replies, with optional keywords", () => {
    expect(matchesTrigger(storyReplyFlow(), storyReply("send the link"))).toBe(true);
    expect(matchesTrigger(storyReplyFlow(), storyReply("hello"))).toBe(false);
    expect(matchesTrigger(storyReplyFlow([]), storyReply("hello"))).toBe(true);
    expect(matchesTrigger(storyReplyFlow([]), { ...storyReply("hello"), storyId: undefined })).toBe(false);
  });

  it("round-trips through the definition schema", () => {
    const parsed = validateFlowDefinition({ ...storyReplyFlow(["Link"]), trigger: { type: "story_reply", match: "keyword", keywords: [" Link "], mode: "exact" } });
    expect((parsed as FlowDefinitionV1).trigger).toEqual({ type: "story_reply", match: "keyword", keywords: ["link"], mode: "exact" });
  });

  async function harness() {
    const repository = createMemoryRepository();
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: ACCOUNT,
      username: "creator",
      accessTokenEncrypted: sealSecret("token", TOKEN_KEY),
      status: "CONNECTED",
    });
    for (const [name, definition] of [["Story", storyReplyFlow()], ["Any DM", anyMessageFlow]] as const) {
      await repository.createAutomation("workspace_a", { name, status: "ACTIVE", instagramAccountId: ACCOUNT, definition });
    }
    const sendDirectMessage = vi.fn().mockImplementation(async () => ({ message_id: `bot_${sendDirectMessage.mock.calls.length}` }));
    return { repository, sendDirectMessage, client: { sendDirectMessage } as never };
  }

  it("answers a matching Story reply once, from the story-reply flow", async () => {
    const { repository, sendDirectMessage, client } = await harness();

    await processNormalizedEvent(storyReply("link please"), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(sendDirectMessage.mock.calls[0]![2]).toMatchObject({ text: "Here is the Story link" });
  });

  it("leaves a non-matching Story reply to the regular DM flows", async () => {
    const { repository, sendDirectMessage, client } = await harness();

    await processNormalizedEvent(storyReply("love this", "mid_2"), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(sendDirectMessage.mock.calls[0]![2]).toMatchObject({ text: "Thanks for your message" });
  });
});
