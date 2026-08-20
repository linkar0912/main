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
});
