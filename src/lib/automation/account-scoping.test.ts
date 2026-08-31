import { describe, expect, it, vi } from "vitest";
import type { FlowDefinitionV1, NormalizedEvent } from "./types";
import { processNormalizedEvent, type AutomationRunnerClient } from "./runner";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";

vi.mock("../mailer", () => ({ sendEmail: vi.fn().mockResolvedValue({ delivered: true }) }));
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
}));

const TOKEN_KEY = "a".repeat(64);

const dmFlow: FlowDefinitionV1 = {
  version: 1,
    trigger: { type: "message", match: "any", keywords: [] },
  conditions: [],
  actions: [{ type: "send_text", text: "Automated reply" }],
};

async function seedTwoAccounts() {
  const repository = createMemoryRepository([
    {
      id: "automation_pinned",
      workspaceId: "workspace_a",
      // Pinned to ig_1 - must never answer events on ig_2.
      instagramAccountId: "ig_1",
      name: "Pinned to account one",
      status: "ACTIVE" as const,
      version: 1, priority: 0,
      definition: dmFlow,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    },
    {
      id: "automation_any",
      workspaceId: "workspace_a",
      name: "Runs on every account",
      status: "ACTIVE" as const,
      version: 1, priority: 0,
      definition: dmFlow,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    },
  ]);
  for (const igUserId of ["ig_1", "ig_2"]) {
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId,
      username: `creator_${igUserId}`,
      accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
      status: "CONNECTED",
    });
  }
  return repository;
}

function messageEvent(accountId: string, id: string): NormalizedEvent {
  return {
    id,
    accountId,
    type: "message.received",
    text: "hello",
    recipientId: `person_${accountId}`,
    timestamp: Date.now(),
  };
}

function createRunnerClient(): AutomationRunnerClient {
  return {
    sendPrivateReply: vi.fn().mockResolvedValue({ message_id: "private_1" }),
    sendDirectMessage: vi.fn().mockResolvedValue({ recipient_id: "person", message_id: "direct_1" }),
    replyToComment: vi.fn().mockResolvedValue({ id: "public_1" }),
    sendQuickReply: vi.fn().mockResolvedValue({ message_id: "quick_1" }),
    getUserFollowStatus: vi.fn().mockResolvedValue({ isUserFollowingBusiness: true }),
    getMedia: vi.fn(),
  };
}

describe("automation account scoping", () => {
  it("a pinned automation answers only its own account, an unpinned one answers both", async () => {
    const repository = await seedTwoAccounts();
    const options = { client: createRunnerClient(), tokenEncryptionKey: TOKEN_KEY };

    // Event on ig_1: both the pinned and the unpinned automation fire.
    const onPinned = await processNormalizedEvent(messageEvent("ig_1", "m1"), repository, options);
    expect(onPinned).toMatchObject({ matched: 2, sent: 2 });

    // Event on ig_2: only the unpinned automation fires.
    const onSibling = await processNormalizedEvent(messageEvent("ig_2", "m2"), repository, options);
    expect(onSibling).toMatchObject({ matched: 1, sent: 1 });
  });

  it("persists a pin on create and can pin or unpin through updates", async () => {
    const repository = createMemoryRepository();
    const created = await repository.createAutomation("workspace_a", {
      provider: "INSTAGRAM",
      name: "Scoped flow",
      definition: dmFlow,
      instagramAccountId: "ig_1",
    });
    expect(created.instagramAccountId).toBe("ig_1");
    expect(created.provider).toBe("INSTAGRAM");

    const unpinned = await repository.updateAutomation("workspace_a", created.id, { instagramAccountId: null });
    expect(unpinned?.instagramAccountId).toBeUndefined();

    const repinned = await repository.updateAutomation("workspace_a", created.id, { instagramAccountId: "ig_2" });
    expect(repinned?.instagramAccountId).toBe("ig_2");

    // Untouched patches keep the pin exactly as it was.
    const renamed = await repository.updateAutomation("workspace_a", created.id, { name: "Renamed" });
    expect(renamed?.instagramAccountId).toBe("ig_2");
  });

  it("deletes automations pinned to an account whose data is deleted, keeping sibling automations", async () => {
    const repository = createMemoryRepository();
    const pinned = await repository.createAutomation("workspace_a", {
      provider: "INSTAGRAM",
      name: "Pinned flow",
      definition: dmFlow,
      instagramAccountId: "ig_target",
    });
    const unpinned = await repository.createAutomation("workspace_a", { provider: "INSTAGRAM", name: "Unpinned flow", definition: dmFlow });
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_target", username: "target", accessTokenEncrypted: "t", status: "CONNECTED" });
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_sibling", username: "sibling", accessTokenEncrypted: "s", status: "CONNECTED" });

    await repository.beginInstagramDataDeletion("ig_target", "linkar_delete_pin", "hash_pin");

    const remaining = await repository.listAutomations("workspace_a");
    expect(remaining.map((automation) => automation.id)).toEqual([unpinned.id]);
    expect(remaining[0].id).not.toBe(pinned.id);
    expect(await repository.listConnections("workspace_a")).toHaveLength(1);
  });

  it("derives provider identity for legacy seeded records and retains it on rename", async () => {
    const repository = createMemoryRepository([
      {
        id: "facebook_legacy",
        workspaceId: "workspace_a",
        facebookPageId: "page_1",
        name: "Legacy Page flow",
        status: "DRAFT",
        version: 1,
        priority: 0,
        definition: { version: 1, trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] }, conditions: [], actions: [{ type: "private_reply", text: "Hello" }] },
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString(),
      },
      {
        id: "instagram_legacy",
        workspaceId: "workspace_a",
        name: "Legacy unpinned flow",
        status: "DRAFT",
        version: 1,
        priority: 0,
        definition: dmFlow,
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString(),
      },
    ]);

    expect((await repository.getAutomation("workspace_a", "facebook_legacy"))?.provider).toBe("FACEBOOK");
    expect((await repository.getAutomation("workspace_a", "instagram_legacy"))?.provider).toBe("INSTAGRAM");

    const renamed = await repository.updateAutomation("workspace_a", "instagram_legacy", { name: "Renamed legacy flow" });
    expect(renamed).toMatchObject({ name: "Renamed legacy flow", provider: "INSTAGRAM" });
  });
});
