import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import type { FlowDefinition } from "@/src/lib/automation/types";

const mocks = vi.hoisted(() => ({ getValidatedSession: vi.fn() }));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));

let repository = createMemoryRepository();
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => repository }));

const { POST } = await import("./route");

const commentDefinition: FlowDefinition = {
  version: 1,
  trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] },
  conditions: [],
  actions: [{ type: "private_reply", text: "Thanks" }],
};

function restore(id: string, versionId: string) {
  return POST(
    new Request(`http://localhost/api/automations/${id}/versions/${versionId}/restore`, { method: "POST" }),
    { params: Promise.resolve({ id, versionId }) },
  );
}

describe("POST /api/automations/[id]/versions/[versionId]/restore", () => {
  beforeEach(async () => {
    repository = createMemoryRepository();
    await repository.ensureWorkspace("workspace_1", "owner@linkar.in");
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", email: "owner@linkar.in", workspaceId: "workspace_1" });
  });

  it("restores the snapshot's provider along with its Page pin", async () => {
    await repository.upsertFacebookPage({
      workspaceId: "workspace_1", pageId: "page_1", pageName: "Page", facebookUserId: "fb_1",
      accessTokenEncrypted: "sealed", status: "CONNECTED",
    });
    await repository.upsertConnection({
      workspaceId: "workspace_1", igUserId: "ig_1", username: "creator", accessTokenEncrypted: "sealed", status: "CONNECTED",
    });
    const automation = await repository.createAutomation("workspace_1", {
      provider: "FACEBOOK", facebookPageId: "page_1", name: "Page flow", definition: commentDefinition,
    });
    const snapshot = await repository.snapshotAutomation("workspace_1", automation.id, "user_1");
    await repository.updateAutomation("workspace_1", automation.id, { provider: "INSTAGRAM", instagramAccountId: "ig_1", facebookPageId: null });

    const response = await restore(automation.id, snapshot!.id);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ provider: "FACEBOOK", facebookPageId: "page_1" });
  });

  it("refuses a snapshot whose pinned account is no longer connected", async () => {
    await repository.upsertConnection({
      workspaceId: "workspace_1", igUserId: "ig_1", username: "creator", accessTokenEncrypted: "sealed", status: "CONNECTED",
    });
    const automation = await repository.createAutomation("workspace_1", {
      provider: "INSTAGRAM", instagramAccountId: "ig_1", name: "Flow", definition: commentDefinition,
    });
    const snapshot = await repository.snapshotAutomation("workspace_1", automation.id);
    await repository.updateConnectionStatus((await repository.listConnections("workspace_1"))[0]!.id, "DISCONNECTED");

    const response = await restore(automation.id, snapshot!.id);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/no longer connected/);
  });

  it("refuses a snapshot whose definition breaks the channel's rules", async () => {
    await repository.upsertFacebookPage({
      workspaceId: "workspace_1", pageId: "page_1", pageName: "Page", facebookUserId: "fb_1",
      accessTokenEncrypted: "sealed", status: "CONNECTED",
    });
    const automation = await repository.createAutomation("workspace_1", {
      provider: "FACEBOOK",
      facebookPageId: "page_1",
      name: "Legacy",
      definition: { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [{ type: "send_text", text: "Hi" }] },
    });
    const snapshot = await repository.snapshotAutomation("workspace_1", automation.id);

    const response = await restore(automation.id, snapshot!.id);

    expect(response.status).toBe(409);
    const body = await response.json() as { issues?: unknown[] };
    expect(body.issues?.length).toBeGreaterThan(0);
  });

  it("returns 404 for an unknown version", async () => {
    const automation = await repository.createAutomation("workspace_1", { name: "Flow", definition: commentDefinition });
    expect((await restore(automation.id, "missing")).status).toBe(404);
  });
});
