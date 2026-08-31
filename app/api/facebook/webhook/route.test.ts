import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueFacebookEvents: vi.fn(),
  processNormalizedFacebookEvent: vi.fn(),
  findWorkspaceByFacebookPage: vi.fn(),
  getWorkspaceStatus: vi.fn(),
}));

vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({
  facebookAppSecret: "secret",
  facebookAppId: "app-1",
  facebookApiVersion: "v25.0",
  facebookVerifyToken: "verify-token",
  facebookTokenEncryptionKey: "k",
  metaTokenEncryptionKey: undefined,
  dispatchLeaseMs: 30_000,
}) }));
vi.mock("@/src/lib/security/signature", () => ({ verifyWebhookSignature: () => true }));
vi.mock("@/src/lib/facebook/webhooks", () => ({ normalizeFacebookWebhook: () => [{
  id: "evt_1", pageId: "page_1", commentId: "comment_1", postId: "post_1",
  text: "hi", senderId: "u_1", senderName: "Maya", timestamp: 1,
}] }));
vi.mock("@/src/lib/queue", () => ({ enqueueFacebookEvents: mocks.enqueueFacebookEvents }));
vi.mock("@/src/lib/facebook/runner", () => ({
  processNormalizedFacebookEvent: mocks.processNormalizedFacebookEvent,
  isRetryableFacebookError: (error: unknown) => Boolean((error as { retryable?: boolean })?.retryable),
  RetryableFacebookError: class extends Error {},
}));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({
  findWorkspaceByFacebookPage: mocks.findWorkspaceByFacebookPage,
  getWorkspaceStatus: mocks.getWorkspaceStatus,
}) }));
vi.mock("@/src/lib/facebook/client", () => ({
  FacebookClient: class { postCommentReply = vi.fn(); },
  FacebookApiError: class extends Error {},
}));

const { GET, POST } = await import("./route");

describe("GET /api/facebook/webhook", () => {
  it("returns the challenge when the verify token matches", async () => {
    const url = "http://localhost/api/facebook/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=abc123";
    const response = await GET(new Request(url));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("abc123");
  });

  it("returns 403 when the verify token does not match", async () => {
    const url = "http://localhost/api/facebook/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123";
    const response = await GET(new Request(url));
    expect(response.status).toBe(403);
  });
});

describe("POST /api/facebook/webhook", () => {
  beforeEach(() => {
    mocks.enqueueFacebookEvents.mockReset().mockResolvedValue(0);
    mocks.processNormalizedFacebookEvent.mockReset().mockResolvedValue({ sent: 1, matched: 1, skipped: 0, failed: 0 });
    mocks.findWorkspaceByFacebookPage.mockReset().mockResolvedValue({ workspaceId: "workspace_1" });
    mocks.getWorkspaceStatus.mockReset().mockResolvedValue("ACTIVE");
  });

  it("returns 503 when the inline runner has a retryable failure", async () => {
    mocks.processNormalizedFacebookEvent.mockRejectedValue(Object.assign(new Error("Meta 429"), { retryable: true }));
    const response = await POST(new Request("http://localhost/api/facebook/webhook", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ received: false, retryable: true });
  });

  it("acknowledges when the inline runner handles the event", async () => {
    mocks.processNormalizedFacebookEvent.mockResolvedValue({ sent: 0, matched: 0, skipped: 1, failed: 0 });
    const response = await POST(new Request("http://localhost/api/facebook/webhook", { method: "POST", body: "{}" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ received: true, events: 1 });
  });

  it("returns 200 immediately when the queue accepts the event", async () => {
    mocks.enqueueFacebookEvents.mockResolvedValue(1);
    const response = await POST(new Request("http://localhost/api/facebook/webhook", { method: "POST", body: "{}" }));
    expect(response.status).toBe(200);
    expect(mocks.processNormalizedFacebookEvent).not.toHaveBeenCalled();
  });

  it("acknowledges but does not enqueue an event for a suspended workspace", async () => {
    mocks.getWorkspaceStatus.mockResolvedValue("SUSPENDED");

    const response = await POST(new Request("http://localhost/api/facebook/webhook", { method: "POST", body: "{}" }));

    expect(response.status).toBe(200);
    expect(mocks.enqueueFacebookEvents).toHaveBeenCalledWith([]);
    expect(mocks.processNormalizedFacebookEvent).not.toHaveBeenCalled();
  });
});
