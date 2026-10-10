import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const APP_SECRET = "instagram-app-secret";
let repository = createMemoryRepository();

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({ metaAppSecret: APP_SECRET, redisUrl: undefined }),
}));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => repository }));

const { POST } = await import("./route");

function signedRequest(userId: string, issuedAt = Math.floor(Date.now() / 1_000)): string {
  const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: userId, issued_at: issuedAt })).toString("base64url");
  const signature = createHmac("sha256", APP_SECRET).update(payload).digest("base64url");
  return `${signature}.${payload}`;
}

function deauthorizeRequest(signed: string): Request {
  return new Request("http://localhost/api/meta/deauthorize", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ signed_request: signed }).toString(),
  });
}

async function connect(igUserId: string) {
  await repository.upsertConnection({
    workspaceId: "workspace_1", igUserId, username: "creator", accessTokenEncrypted: "sealed", status: "CONNECTED",
  });
}

describe("POST /api/meta/deauthorize", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
  });

  it("disconnects the account named by a fresh signed request", async () => {
    await connect("ig_fresh");
    const response = await POST(deauthorizeRequest(signedRequest("ig_fresh")));
    expect(response.status).toBe(200);
    expect(await repository.listConnections("workspace_1")).toEqual([]);
  });

  it("rejects a stale signed request", async () => {
    await connect("ig_stale");
    const twoDaysAgo = Math.floor(Date.now() / 1_000) - 2 * 24 * 60 * 60;
    const response = await POST(deauthorizeRequest(signedRequest("ig_stale", twoDaysAgo)));
    expect(response.status).toBe(403);
    expect(await repository.listConnections("workspace_1")).toHaveLength(1);
  });

  it("ignores a replay of an already-processed signed request", async () => {
    await connect("ig_replay");
    const signed = signedRequest("ig_replay");
    expect((await POST(deauthorizeRequest(signed))).status).toBe(200);

    // The owner reconnects; a captured copy of the old callback must not
    // disconnect them again.
    await connect("ig_replay");
    const replay = await POST(deauthorizeRequest(signed));

    expect(replay.status).toBe(200);
    expect(await repository.listConnections("workspace_1")).toHaveLength(1);
  });

  it("refuses an oversized body before parsing it", async () => {
    const response = await POST(new Request("http://localhost/api/meta/deauthorize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `signed_request=${"a".repeat(1024 * 1024 + 1)}`,
    }));
    expect(response.status).toBe(413);
  });
});
