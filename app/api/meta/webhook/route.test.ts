import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueWebhookEvents: vi.fn(),
  processNormalizedEvent: vi.fn(),
  findWorkspaceByInstagramAccount: vi.fn(),
  getWorkspaceStatus: vi.fn(),
}));

vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({
  metaAppSecret: "secret",
  metaApiVersion: "v23.0",
  followGatedCampaignsEnabled: false,
  dispatchLeaseMs: 30_000,
}) }));
vi.mock("@/src/lib/security/signature", () => ({ verifyWebhookSignature: () => true }));
vi.mock("@/src/lib/meta/webhooks", () => ({ normalizeWebhook: () => [{
  id: "event_1", accountId: "ig_1", type: "message.received", text: "hi", recipientId: "person_1", timestamp: 1,
}] }));
vi.mock("@/src/lib/queue", () => ({ enqueueWebhookEvents: mocks.enqueueWebhookEvents }));
vi.mock("@/src/lib/automation/runner", () => ({
  processNormalizedEvent: mocks.processNormalizedEvent,
  isRetryableAutomationError: (error: unknown) => Boolean((error as { retryable?: boolean })?.retryable),
}));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({
  findWorkspaceByInstagramAccount: mocks.findWorkspaceByInstagramAccount,
  getWorkspaceStatus: mocks.getWorkspaceStatus,
}) }));

const { POST } = await import("./route");

describe("POST /api/meta/webhook", () => {
  beforeEach(() => {
    mocks.enqueueWebhookEvents.mockReset().mockResolvedValue(0);
    mocks.processNormalizedEvent.mockReset().mockResolvedValue({ sent: 1 });
    mocks.findWorkspaceByInstagramAccount.mockReset().mockResolvedValue({ workspaceId: "workspace_1" });
    mocks.getWorkspaceStatus.mockReset().mockResolvedValue("ACTIVE");
  });

  it("returns 503 when inline processing has a retryable failure", async () => {
    mocks.processNormalizedEvent.mockRejectedValue(Object.assign(new Error("Meta 429"), { retryable: true }));
    const response = await POST(new Request("http://localhost/api/meta/webhook", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ received: false, retryable: true });
  });

  it("acknowledges a permanent or handled inline outcome", async () => {
    mocks.processNormalizedEvent.mockResolvedValue({ sent: 0, failed: 1 });
    const response = await POST(new Request("http://localhost/api/meta/webhook", { method: "POST", body: "{}" }));
    expect(response.status).toBe(200);
  });

  it("acknowledges but does not enqueue an event for a suspended workspace", async () => {
    mocks.getWorkspaceStatus.mockResolvedValue("SUSPENDED");

    const response = await POST(new Request("http://localhost/api/meta/webhook", { method: "POST", body: "{}" }));

    expect(response.status).toBe(200);
    expect(mocks.enqueueWebhookEvents).toHaveBeenCalledWith([]);
    expect(mocks.processNormalizedEvent).not.toHaveBeenCalled();
  });
});
