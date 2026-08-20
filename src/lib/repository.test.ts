import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "./memory-repository";

const definition = {
  version: 1 as const,
  trigger: { type: "comment" as const, match: "keyword" as const, keywords: ["guide"], mediaIds: [] },
  conditions: [],
  actions: [{ type: "private_reply" as const, text: "Here you go" }],
};

describe("memory repository", () => {
  it("creates, lists, and updates automations within a workspace", async () => {
    const repository = createMemoryRepository();
    const created = await repository.createAutomation("workspace_a", {
      name: "Guide delivery",
      definition,
    });

    expect(created.status).toBe("DRAFT");
    expect((await repository.listAutomations("workspace_a"))).toHaveLength(1);
    expect((await repository.listAutomations("workspace_b"))).toHaveLength(0);

    const updated = await repository.updateAutomation("workspace_a", created.id, { status: "ACTIVE" });
    expect(updated?.status).toBe("ACTIVE");
    expect(await repository.updateAutomation("workspace_b", created.id, { status: "PAUSED" })).toBeNull();
  });

  it("rejects a duplicate execution dedupe key", async () => {
    const repository = createMemoryRepository();
    const first = await repository.recordExecution({
      workspaceId: "workspace_a",
      automationId: "automation_1",
      externalEventId: "comment_1",
      dedupeKey: "automation_1:comment_1",
      status: "SENT",
      reason: "demo",
    });
    const second = await repository.recordExecution({
      workspaceId: "workspace_a",
      automationId: "automation_1",
      externalEventId: "comment_1",
      dedupeKey: "automation_1:comment_1",
      status: "SENT",
      reason: "duplicate",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });

  it("finds a workspace connection by Instagram account id", async () => {
    const repository = createMemoryRepository();
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_123",
      username: "creator",
      accessTokenEncrypted: "sealed-token",
      status: "CONNECTED",
    });

    expect((await repository.findWorkspaceByInstagramAccount("ig_123"))?.workspaceId).toBe("workspace_a");
    expect(await repository.findWorkspaceByInstagramAccount("ig_missing")).toBeNull();

    await repository.deleteConnectionByInstagramAccount("ig_123");
    expect(await repository.findWorkspaceByInstagramAccount("ig_123")).toBeNull();
  });

  it("disconnects only the selected connection in the authorized workspace", async () => {
    const repository = createMemoryRepository();
    const first = await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "one", accessTokenEncrypted: "token-one", status: "CONNECTED" });
    await repository.upsertConnection({ workspaceId: "workspace_b", igUserId: "ig_2", username: "two", accessTokenEncrypted: "token-two", status: "CONNECTED" });

    expect(await repository.deleteConnection("workspace_b", first.id)).toBe(false);
    expect(await repository.deleteConnection("workspace_a", first.id)).toBe(true);
    expect(await repository.listConnections("workspace_a")).toEqual([]);
    expect(await repository.listConnections("workspace_b")).toHaveLength(1);
  });

  it("deletes Instagram-derived workspace data and persists a confirmation status", async () => {
    const repository = createMemoryRepository();
    const automation = await repository.createAutomation("workspace_a", { name: "Guide delivery", definition });
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_123", username: "creator", accessTokenEncrypted: "sealed-token", status: "CONNECTED" });
    await repository.recordExecution({ workspaceId: "workspace_a", automationId: automation.id, externalEventId: "comment_1", dedupeKey: "dedupe_1", status: "SENT" });

    await repository.deleteInstagramData("ig_123", "replyconnect_delete_123", "hashed-instagram-user-id");

    expect(await repository.listAutomations("workspace_a")).toEqual([]);
    expect(await repository.listConnections("workspace_a")).toEqual([]);
    expect(await repository.hasExecution("workspace_a", "dedupe_1")).toBe(false);
    expect(await repository.getDataDeletionRequest("replyconnect_delete_123")).toMatchObject({
      confirmationCode: "replyconnect_delete_123",
      instagramUserIdHash: "hashed-instagram-user-id",
      status: "COMPLETED",
    });
  });
});
