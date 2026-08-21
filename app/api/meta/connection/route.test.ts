import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  getServerEnv: vi.fn(),
  unsubscribeFromWebhooks: vi.fn(),
  unsealSecret: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));

vi.mock("@/src/lib/meta/client", () => ({
  MetaClient: class {
    unsubscribeFromWebhooks = mocks.unsubscribeFromWebhooks;
  },
}));

vi.mock("@/src/lib/security/secrets", () => ({
  unsealSecret: mocks.unsealSecret,
}));

let repository = createMemoryRepository();

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => repository,
}));

const { DELETE } = await import("./route");

function mediaSnapshot(id: string) {
  return {
    id,
    mediaType: "VIDEO" as const,
    mediaProductType: "REELS" as const,
    permalink: `https://instagram.com/reel/${id}`,
    timestamp: "2026-08-21T09:00:00.000Z",
  };
}

function deleteRequest(body: unknown): Request {
  return new Request("http://localhost/api/meta/connection", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("DELETE /api/meta/connection", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    mocks.getSessionFromRequest.mockReset();
    mocks.getSessionFromRequest.mockReturnValue({ email: "owner@example.com", workspaceId: "workspace_1" });
    mocks.getServerEnv.mockReset();
    mocks.getServerEnv.mockReturnValue({ metaApiVersion: "v25.0", metaTokenEncryptionKey: "encryption-key" });
    mocks.unsealSecret.mockReset();
    mocks.unsealSecret.mockReturnValue("plain-token");
    mocks.unsubscribeFromWebhooks.mockReset();
    mocks.unsubscribeFromWebhooks.mockResolvedValue(undefined);
  });

  it("returns 401 when the owner session is missing", async () => {
    mocks.getSessionFromRequest.mockReturnValue(null);

    const response = await DELETE(deleteRequest({ id: "connection_1" }));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the connection does not belong to the workspace", async () => {
    const response = await DELETE(deleteRequest({ id: "missing_connection" }));

    expect(response.status).toBe(404);
  });

  it("expires non-terminal participants for the disconnected account with a visible reason before deleting the connection, leaving terminal and unrelated participants untouched", async () => {
    const connection = await repository.upsertConnection({
      workspaceId: "workspace_1",
      igUserId: "ig_123",
      username: "creator",
      accessTokenEncrypted: "sealed-token",
      status: "CONNECTED",
    });
    const { record: nonTerminal } = await repository.createParticipant({
      workspaceId: "workspace_1",
      automationId: "automation_1",
      instagramAccountId: "ig_123",
      sourceCommentId: "comment_1",
      sourceMediaId: "media_1",
      sourceMediaSnapshot: mediaSnapshot("media_1"),
      state: "FOLLOW_REQUIRED",
    });
    const { record: terminal } = await repository.createParticipant({
      workspaceId: "workspace_1",
      automationId: "automation_1",
      instagramAccountId: "ig_123",
      sourceCommentId: "comment_2",
      sourceMediaId: "media_1",
      sourceMediaSnapshot: mediaSnapshot("media_1"),
      state: "LINK_SENT",
    });
    const { record: unrelated } = await repository.createParticipant({
      workspaceId: "workspace_2",
      automationId: "automation_2",
      instagramAccountId: "ig_999",
      sourceCommentId: "comment_3",
      sourceMediaId: "media_2",
      sourceMediaSnapshot: mediaSnapshot("media_2"),
      state: "FOLLOW_REQUIRED",
    });

    const response = await DELETE(deleteRequest({ id: connection.id }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ disconnected: true, remoteUnsubscribed: true });
    expect(await repository.listConnections("workspace_1")).toEqual([]);

    const expired = await repository.getParticipant("workspace_1", "ig_123", nonTerminal.id);
    expect(expired?.state).toBe("EXPIRED");
    expect(expired?.finalDeliveryError).toBe("Instagram account disconnected");

    const stillTerminal = await repository.getParticipant("workspace_1", "ig_123", terminal.id);
    expect(stillTerminal?.state).toBe("LINK_SENT");

    const stillUnrelated = await repository.getParticipant("workspace_2", "ig_999", unrelated.id);
    expect(stillUnrelated?.state).toBe("FOLLOW_REQUIRED");
  });

  it("expires participants before deleting the connection record", async () => {
    const connection = await repository.upsertConnection({
      workspaceId: "workspace_1",
      igUserId: "ig_order",
      username: "creator2",
      accessTokenEncrypted: "sealed-token-2",
      status: "CONNECTED",
    });

    const calls: string[] = [];
    const expireSpy = vi.spyOn(repository, "expireParticipantsByInstagramAccount").mockImplementation(async () => {
      calls.push("expire");
      expect(await repository.listConnections("workspace_1")).toHaveLength(1);
      return 0;
    });
    const deleteSpy = vi.spyOn(repository, "deleteConnection").mockImplementation(async () => {
      calls.push("delete");
      return true;
    });

    const response = await DELETE(deleteRequest({ id: connection.id }));

    expect(response.status).toBe(200);
    expect(calls).toEqual(["expire", "delete"]);
    expect(expireSpy).toHaveBeenCalledWith("ig_order", "Instagram account disconnected");
    expect(deleteSpy).toHaveBeenCalledWith("workspace_1", connection.id);

    expireSpy.mockRestore();
    deleteSpy.mockRestore();
  });
});
