import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import type { FlowDefinitionV1 } from "./types";
import { processNormalizedEvent, type AutomationRunnerClient } from "./runner";
import { sealSecret } from "../security/secrets";

vi.mock("../mailer", () => ({ sendEmail: vi.fn().mockResolvedValue({ delivered: true }) }));
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
}));

const TOKEN_KEY = "a".repeat(64);

function messageEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    accountId: "ig_1",
    type: "message.received" as const,
    text: "hello",
    recipientId: "person_1",
    timestamp: Date.now(),
    ...overrides,
  };
}

function createRunnerClient(): AutomationRunnerClient {
  return {
    sendPrivateReply: vi.fn().mockResolvedValue({ message_id: "private_1" }),
    sendDirectMessage: vi.fn().mockResolvedValue({ recipient_id: "person_1", message_id: "direct_1" }),
    replyToComment: vi.fn().mockResolvedValue({ id: "public_1" }),
    sendQuickReply: vi.fn().mockResolvedValue({ message_id: "quick_1" }),
    sendQuickReplies: vi.fn().mockResolvedValue({ message_id: "quick_multi_1" }),
    getUserFollowStatus: vi.fn().mockResolvedValue({ isUserFollowingBusiness: true }),
    getMedia: vi.fn(),
  };
}

async function seedWorkspace() {
  const repository = createMemoryRepository();
  await repository.upsertConnection({
    workspaceId: "workspace_a",
    igUserId: "ig_1",
    username: "creator",
    accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
    status: "CONNECTED",
  });
  const automation = await repository.createAutomation("workspace_a", {
    name: "Flow",
    definition: {
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [{ type: "send_text", text: "Automated reply" }],
    },
  });
  await repository.updateAutomation("workspace_a", automation.id, { status: "ACTIVE" });
  return { repository, automationId: automation.id };
}

describe("quick replies flow action", () => {
  it("sends one DM carrying up to four tappable chips and personalizes tokens", async () => {
    const { repository } = await seedWorkspace();
    const client = createRunnerClient();
    await repository.updateAutomation("workspace_a", (await repository.listAutomations("workspace_a"))[0].id, {
      definition: {
        version: 1,
        trigger: { type: "message", match: "any", keywords: [] },
        conditions: [],
        actions: [{ type: "quick_replies", text: "Hey {username}! Interested?", replies: ["Yes", "Not now", "  ", ""] }],
      },
    });

    const result = await processNormalizedEvent(
      messageEvent({ senderUsername: "maya" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );
    console.log("DBG_RESULT", JSON.stringify(result));
    const problems = await repository.listOutboundDeliveryProblems("workspace_a", 5);
    expect(problems.map((problem) => problem.lastError)).toEqual([]);
    expect(result).toMatchObject({ matched: 1, sent: 1 });
    expect(client.sendQuickReplies).toHaveBeenCalledTimes(1);
    const quickRepliesMock = client.sendQuickReplies as unknown as ReturnType<typeof vi.fn>;
    const [recipientId, text, replies] = quickRepliesMock.mock.calls[0]!.slice(1);
    expect(recipientId).toBe("person_1");
    expect(text).toBe("Hey maya! Interested?");
    expect(replies).toEqual(["Yes", "Not now"]);
  });

  it("records a webhook activity entry for every processed event", async () => {
    const { repository } = await seedWorkspace();
    expect(await repository.listRecentWebhookEvents("workspace_a", 10)).toHaveLength(0);
    const event = messageEvent();
    await processNormalizedEvent(event, repository, { client: createRunnerClient(), tokenEncryptionKey: TOKEN_KEY });
    const entries = await repository.listRecentWebhookEvents("workspace_a", 10);
    expect(entries).toHaveLength(1);
    expect(entries[0].eventType).toBe("message.received");
    // Replaying the same event does not duplicate the activity row.
    await processNormalizedEvent(
      messageEvent({ id: event.id }),
      repository,
      { client: createRunnerClient(), tokenEncryptionKey: TOKEN_KEY },
    );
    expect(await repository.listRecentWebhookEvents("workspace_a", 10)).toHaveLength(1);
  });
});

describe("contact engagement: tags, score, timeline", () => {
  it("tags and scores contacts on capture and suppression, preserving automatic labels", async () => {
    const repository = createMemoryRepository();
    await repository.touchContact("workspace_a", "ig_1", "person_1", new Date().toISOString());
    let contact = await repository.getContact("workspace_a", "ig_1", "person_1");
    expect(contact).toMatchObject({ tags: [], score: 0 });

    await repository.captureContactEmail("workspace_a", "ig_1", "person_1", "Maya@Example.com ", new Date().toISOString());
    contact = await repository.getContact("workspace_a", "ig_1", "person_1");
    expect(contact?.email).toBe("maya@example.com");
    expect(contact?.tags).toContain("email_captured");
    expect(contact?.score).toBe(10);

    await repository.suppressContact("workspace_a", "ig_1", "person_1", new Date().toISOString());
    contact = await repository.getContact("workspace_a", "ig_1", "person_1");
    expect(contact?.tags).toContain("opted_out");

    const updated = await repository.setContactTags("workspace_a", "ig_1", "person_1", ["vip"]);
    expect(updated?.tags.sort()).toEqual(["email_captured", "opted_out", "vip"]);
    expect(await repository.countSuppressedContacts("workspace_a")).toBe(1);
  });

  it("clicking a tracked delivery link tags the person and bumps their score once", async () => {
    const { repository, automationId } = await seedWorkspace();
    await repository.touchContact("workspace_a", "ig_1", "person_1", new Date().toISOString());
    const created = await repository.createParticipant({
      workspaceId: "workspace_a",
      automationId,
      instagramAccountId: "ig_1",
      igScopedUserId: "person_1",
      sourceCommentId: "c1",
      sourceMediaId: "m1",
      sourceMediaSnapshot: { id: "m1", mediaType: "IMAGE", permalink: "https://x.com/p", timestamp: new Date().toISOString() },
    });
    const participant = created.record;
    expect(await repository.markDeliveryClicked(participant.id, new Date().toISOString())).toBe(true);
    expect(await repository.markDeliveryClicked(participant.id, new Date().toISOString())).toBe(false);

    const contact = await repository.getContact("workspace_a", "ig_1", "person_1");
    expect(contact?.tags).toContain("clicked");
    expect(contact?.score).toBe(5);

    const timeline = contact ? await repository.getContactTimeline("workspace_a", contact.id, 20) : [];
    expect(timeline.some((entry) => entry.kind === "interaction")).toBe(true);
  });

  it("reports A/B variant performance from recorded labels", async () => {
    const { repository, automationId } = await seedWorkspace();
    const base = {
      workspaceId: "workspace_a",
      instagramAccountId: "ig_1",
      automationId,
      sourceCommentId: "",
      sourceMediaId: "m1",
      sourceMediaSnapshot: { id: "m1", mediaType: "IMAGE" as const, permalink: "p", timestamp: new Date().toISOString() },
    };
    for (const [index, label] of ["A", "B"].entries()) {
      await repository.createParticipant({
        ...base,
        sourceCommentId: `comment_${index}`,
        variantLabel: label,
        state: label === "A" ? "LINK_SENT" : undefined,
        finalDeliveryStatus: label === "A" ? "SENT" : undefined,
        deliveryClickedAt: label === "A" ? new Date().toISOString() : undefined,
      });
    }
    expect(await repository.countParticipantsByVariant("workspace_a", automationId)).toEqual([
      { variant: "A", participants: 1, delivered: 1, clicked: 1 },
      { variant: "B", participants: 1, delivered: 0, clicked: 0 },
    ]);
  });
});
