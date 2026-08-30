import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { processFacebookDeauthorization } from "./deauthorization";

function signedRequest(userId: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: userId, issued_at: 1_700_000_000 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${signature}.${payload}`;
}

describe("processFacebookDeauthorization", () => {
  it("deletes every Page connected by the app-scoped Facebook user", async () => {
    const repository = createMemoryRepository();
    await repository.upsertFacebookPage({
      workspaceId: "ws_1", pageId: "page_1", pageName: "Acme", facebookUserId: "fb_user_1",
      accessTokenEncrypted: "sealed", status: "CONNECTED",
    });
    await expect(processFacebookDeauthorization(signedRequest("fb_user_1", "secret"), "secret", repository))
      .resolves.toEqual({ ok: true, facebookUserId: "fb_user_1" });
    await expect(repository.listFacebookPages("ws_1")).resolves.toEqual([]);
  });
});
