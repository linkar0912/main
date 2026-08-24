import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { processDeauthorization } from "./deauthorization";

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signedRequest(userId: string, secret: string): string {
  const payload = encode(JSON.stringify({
    algorithm: "HMAC-SHA256",
    issued_at: Math.floor(Date.now() / 1_000),
    user_id: userId,
  }));
  const signature = createHmac("sha256", secret).update(payload).digest();
  return `${encode(signature)}.${payload}`;
}

describe("processDeauthorization", () => {
  it("disconnects the Instagram account named by a valid Meta signed request", async () => {
    const repository = createMemoryRepository();
    await repository.upsertConnection({
      workspaceId: "workspace_1",
      igUserId: "ig_123",
      username: "linkar_test",
      accessTokenEncrypted: "sealed-token",
      status: "CONNECTED",
    });

    const result = await processDeauthorization(
      signedRequest("ig_123", "instagram-app-secret"),
      "instagram-app-secret",
      repository,
    );

    expect(result).toEqual({ ok: true, instagramUserId: "ig_123" });
    expect(await repository.listConnections("workspace_1")).toEqual([]);
  });

  it("rejects an invalid signature without disconnecting the account", async () => {
    const repository = createMemoryRepository();
    await repository.upsertConnection({
      workspaceId: "workspace_1",
      igUserId: "ig_123",
      username: "linkar_test",
      accessTokenEncrypted: "sealed-token",
      status: "CONNECTED",
    });

    const result = await processDeauthorization(
      signedRequest("ig_123", "wrong-secret"),
      "instagram-app-secret",
      repository,
    );

    expect(result).toEqual({ ok: false, reason: "invalid-signed-request" });
    expect(await repository.listConnections("workspace_1")).toHaveLength(1);
  });

  it("expires non-terminal participants for the deauthorized account with a visible reason before deleting the connection", async () => {
    const repository = createMemoryRepository();
    await repository.upsertConnection({
      workspaceId: "workspace_1",
      igUserId: "ig_123",
      username: "linkar_test",
      accessTokenEncrypted: "sealed-token",
      status: "CONNECTED",
    });
    const mediaSnapshot = (id: string) => ({
      id,
      mediaType: "VIDEO" as const,
      mediaProductType: "REELS" as const,
      permalink: `https://instagram.com/reel/${id}`,
      timestamp: "2026-08-21T09:00:00.000Z",
    });
    const { record: participant } = await repository.createParticipant({
      workspaceId: "workspace_1",
      automationId: "automation_1",
      instagramAccountId: "ig_123",
      sourceCommentId: "comment_1",
      sourceMediaId: "media_1",
      sourceMediaSnapshot: mediaSnapshot("media_1"),
      state: "FOLLOW_REQUIRED",
    });
    const { record: alreadyDelivered } = await repository.createParticipant({
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

    const result = await processDeauthorization(
      signedRequest("ig_123", "instagram-app-secret"),
      "instagram-app-secret",
      repository,
    );

    expect(result).toEqual({ ok: true, instagramUserId: "ig_123" });
    expect(await repository.listConnections("workspace_1")).toEqual([]);

    const expired = await repository.getParticipant("workspace_1", "ig_123", participant.id);
    expect(expired?.state).toBe("EXPIRED");
    expect(expired?.finalDeliveryError).toBe("Instagram account deauthorized");

    const terminal = await repository.getParticipant("workspace_1", "ig_123", alreadyDelivered.id);
    expect(terminal?.state).toBe("LINK_SENT");

    const untouched = await repository.getParticipant("workspace_2", "ig_999", unrelated.id);
    expect(untouched?.state).toBe("FOLLOW_REQUIRED");
  });
});
