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
      username: "replyconnect_test",
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
      username: "replyconnect_test",
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
});
