import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueWebhookEvents: vi.fn(),
  enqueueManualReplyEchoes: vi.fn(),
  processNormalizedEvent: vi.fn(),
  findWorkspaceByInstagramAccount: vi.fn(),
  getWorkspaceStatus: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/src/lib/logger", () => ({
  logger: { error: mocks.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
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
vi.mock("@/src/lib/queue", () => ({
  enqueueWebhookEvents: mocks.enqueueWebhookEvents,
  enqueueManualReplyEchoes: mocks.enqueueManualReplyEchoes,
}));
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
    mocks.enqueueManualReplyEchoes.mockReset().mockResolvedValue(0);
    mocks.processNormalizedEvent.mockReset().mockResolvedValue({ sent: 1 });
    mocks.findWorkspaceByInstagramAccount.mockReset().mockResolvedValue({ workspaceId: "workspace_1" });
    mocks.getWorkspaceStatus.mockReset().mockResolvedValue("ACTIVE");
    mocks.logError.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks Meta to redeliver with a 503 when the enqueue fails", async () => {
    mocks.enqueueWebhookEvents.mockRejectedValue(new Error("Connection is closed."));

    const response = await POST(new Request("http://localhost/api/meta/webhook", { method: "POST", body: "{}" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ received: false, retryable: true });
    expect(mocks.processNormalizedEvent).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.stringContaining("enqueue failed"),
      expect.objectContaining({ channel: "instagram", events: 1, error: "Connection is closed." }),
    );
  });

  it("gives up on an enqueue that hangs after 5 s and asks Meta to redeliver", async () => {
    vi.useFakeTimers();
    mocks.enqueueWebhookEvents.mockReturnValue(new Promise(() => undefined));

    let settled = false;
    const pending = POST(new Request("http://localhost/api/meta/webhook", { method: "POST", body: "{}" }))
      .finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const response = await pending;

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ received: false, retryable: true });
    expect(mocks.processNormalizedEvent).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ channel: "instagram", events: 1 }));
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

  it("enqueues every signed normalized event without database prefiltering", async () => {
    mocks.enqueueWebhookEvents.mockResolvedValue(1);

    const response = await POST(new Request("http://localhost/api/meta/webhook", { method: "POST", body: "{}" }));

    expect(response.status).toBe(200);
    // The arrival time travels with the job so the worker can time the whole reply.
    expect(mocks.enqueueWebhookEvents).toHaveBeenCalledWith([
      expect.objectContaining({ id: "event_1", accountId: "ig_1" }),
    ], undefined, { receivedAt: expect.any(Number) });
    expect(mocks.findWorkspaceByInstagramAccount).not.toHaveBeenCalled();
    expect(mocks.getWorkspaceStatus).not.toHaveBeenCalled();
    expect(mocks.processNormalizedEvent).not.toHaveBeenCalled();
  });
});
