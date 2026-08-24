import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDeletionResponse, isFreshDeletionRequest, parseSignedRequest } from "./data-deletion";
import { createMemoryRepository } from "../memory-repository";

function signedRequest(payload: Record<string, unknown>, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${signature}.${encodedPayload}`;
}

describe("Meta data deletion", () => {
  it("accepts a valid signed request and rejects a tampered one", () => {
    const request = signedRequest({ algorithm: "HMAC-SHA256", user_id: "ig_123", issued_at: 1_700_000_000 }, "app-secret");
    expect(parseSignedRequest(request, "app-secret")).toEqual({ user_id: "ig_123", issued_at: 1_700_000_000 });
    expect(parseSignedRequest(`${request}tampered`, "app-secret")).toBeNull();
    expect(parseSignedRequest(signedRequest({ algorithm: "none", user_id: "ig_123" }, "app-secret"), "app-secret")).toBeNull();
  });

  it("rejects newly submitted signed requests outside the allowed age", () => {
    const request = signedRequest({ algorithm: "HMAC-SHA256", user_id: "ig_123", issued_at: 1_700_000_000 }, "app-secret");
    const payload = parseSignedRequest(request, "app-secret");
    expect(payload && isFreshDeletionRequest(payload, 1_700_000_000_000)).toBe(true);
    expect(payload && isFreshDeletionRequest(payload, 1_700_100_000_000)).toBe(false);
  });

  it("builds the callback response Meta expects", () => {
    expect(createDeletionResponse("linkar_delete_123", "https://linkar.example/data-deletion/status/linkar_delete_123")).toEqual({
      url: "https://linkar.example/data-deletion/status/linkar_delete_123",
      confirmation_code: "linkar_delete_123",
    });
  });

  it("removes all participant rows for workspaces connected to the deauthorized Instagram account, leaving unrelated workspaces untouched", async () => {
    const repository = createMemoryRepository();
    const mediaSnapshot = (id: string) => ({
      id,
      mediaType: "VIDEO" as const,
      mediaProductType: "REELS" as const,
      permalink: `https://instagram.com/reel/${id}`,
      timestamp: "2026-08-21T09:00:00.000Z",
    });
    await repository.upsertConnection({
      workspaceId: "workspace_1",
      igUserId: "ig_123",
      username: "creator",
      accessTokenEncrypted: "sealed-token",
      status: "CONNECTED",
    });
    await repository.upsertConnection({
      workspaceId: "workspace_2",
      igUserId: "ig_999",
      username: "unrelated",
      accessTokenEncrypted: "sealed-token-2",
      status: "CONNECTED",
    });
    const { record: affectedFirst } = await repository.createParticipant({
      workspaceId: "workspace_1",
      automationId: "automation_1",
      instagramAccountId: "ig_123",
      sourceCommentId: "comment_1",
      sourceMediaId: "media_1",
      sourceMediaSnapshot: mediaSnapshot("media_1"),
    });
    const { record: affectedSecond } = await repository.createParticipant({
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
    });

    await repository.beginInstagramDataDeletion("ig_123", "linkar_delete_1", "hash_1");

    expect(await repository.getParticipant("workspace_1", "ig_123", affectedFirst.id)).toBeNull();
    expect(await repository.getParticipant("workspace_1", "ig_123", affectedSecond.id)).toBeNull();
    expect(await repository.getParticipant("workspace_2", "ig_999", unrelated.id)).toMatchObject({ id: unrelated.id });
  });

  it("removes only the requested account data when its workspace has another connection", async () => {
    const repository = createMemoryRepository();
    const mediaSnapshot = (id: string) => ({
      id,
      mediaType: "VIDEO" as const,
      mediaProductType: "REELS" as const,
      permalink: `https://instagram.com/reel/${id}`,
      timestamp: "2026-08-21T09:00:00.000Z",
    });
    const automation = await repository.createAutomation("workspace_1", {
      name: "Sibling-safe flow",
      definition: {
        version: 1 as const,
        trigger: { type: "comment" as const, keywords: ["guide"], match: "any" as const, mediaIds: [] },
        conditions: [],
        actions: [{ type: "private_reply" as const, text: "Here you go" }],
      },
    });
    await repository.upsertConnection({ workspaceId: "workspace_1", igUserId: "ig_target", username: "target", accessTokenEncrypted: "target-token", status: "CONNECTED" });
    await repository.upsertConnection({ workspaceId: "workspace_1", igUserId: "ig_sibling", username: "sibling", accessTokenEncrypted: "sibling-token", status: "CONNECTED" });
    const { record: targetParticipant } = await repository.createParticipant({
      workspaceId: "workspace_1", automationId: automation.id, instagramAccountId: "ig_target",
      sourceCommentId: "target-comment", sourceMediaId: "target-media", sourceMediaSnapshot: mediaSnapshot("target-media"),
    });
    const { record: siblingParticipant } = await repository.createParticipant({
      workspaceId: "workspace_1", automationId: automation.id, instagramAccountId: "ig_sibling",
      sourceCommentId: "sibling-comment", sourceMediaId: "sibling-media", sourceMediaSnapshot: mediaSnapshot("sibling-media"),
    });
    await repository.touchContact("workspace_1", "ig_target", "target-person", "2026-08-23T09:00:00.000Z");
    await repository.touchContact("workspace_1", "ig_sibling", "sibling-person", "2026-08-23T09:00:00.000Z");

    await repository.beginInstagramDataDeletion("ig_target", "linkar_delete_target", "hash_target");

    expect(await repository.getParticipant("workspace_1", "ig_target", targetParticipant.id)).toBeNull();
    expect(await repository.getParticipant("workspace_1", "ig_sibling", siblingParticipant.id)).toMatchObject({ id: siblingParticipant.id });
    expect(await repository.getContact("workspace_1", "ig_target", "target-person")).toBeNull();
    expect(await repository.getContact("workspace_1", "ig_sibling", "sibling-person")).toMatchObject({ igScopedUserId: "sibling-person" });
    expect(await repository.listConnections("workspace_1")).toEqual([expect.objectContaining({ igUserId: "ig_sibling" })]);
    expect(await repository.listAutomations("workspace_1")).toEqual([expect.objectContaining({ id: automation.id })]);
  });
});
