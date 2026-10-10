import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getMemberRole: vi.fn(),
  listBroadcasts: vi.fn(),
  listBroadcastRecipients: vi.fn(),
  createBroadcast: vi.fn(),
  getMessagingWindow: vi.fn(),
  incrementBroadcastCounters: vi.fn(),
  finalizeBroadcastIfDone: vi.fn(),
  ensureOutboundDelivery: vi.fn(),
  claimOutboundDelivery: vi.fn(),
  failOutboundDelivery: vi.fn(),
  reconcileBroadcastCounters: vi.fn(),
  reserveMonthlyBroadcast: vi.fn(),
  releaseMonthlyBroadcast: vi.fn(),
  enqueueBroadcastSends: vi.fn(),
  assertEntitled: vi.fn(),
  getEffectiveEntitlements: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getValidatedSession: mocks.getValidatedSession,
}));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    getMemberRole: mocks.getMemberRole,
    listBroadcasts: mocks.listBroadcasts,
    listBroadcastRecipients: mocks.listBroadcastRecipients,
    createBroadcast: mocks.createBroadcast,
    getMessagingWindow: mocks.getMessagingWindow,
    incrementBroadcastCounters: mocks.incrementBroadcastCounters,
    finalizeBroadcastIfDone: mocks.finalizeBroadcastIfDone,
    ensureOutboundDelivery: mocks.ensureOutboundDelivery,
    claimOutboundDelivery: mocks.claimOutboundDelivery,
    failOutboundDelivery: mocks.failOutboundDelivery,
    reconcileBroadcastCounters: mocks.reconcileBroadcastCounters,
    reserveMonthlyBroadcast: mocks.reserveMonthlyBroadcast,
    releaseMonthlyBroadcast: mocks.releaseMonthlyBroadcast,
  }),
}));
vi.mock("@/src/lib/queue", () => ({
  enqueueBroadcastSends: mocks.enqueueBroadcastSends,
  isQueueConfigured: () => true,
}));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({
    assertEntitled: mocks.assertEntitled,
    getEffectiveEntitlements: mocks.getEffectiveEntitlements,
  }),
}));

const { GET, POST } = await import("./route");

function create(body: unknown = { name: "Update", text: "Hello", segment: "all_contacts" }) {
  return POST(new Request("http://localhost/api/broadcasts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

const createdBroadcast = {
  id: "broadcast_1", workspaceId: "workspace_1", name: "Update", text: "Hello", segment: "all_contacts", status: "RUNNING", total: 2, sent: 0, failed: 0, skipped: 0,
};

describe("/api/broadcasts", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue(null);
    mocks.getMemberRole.mockReset().mockResolvedValue("OWNER");
    mocks.listBroadcasts.mockReset().mockResolvedValue([]);
    mocks.listBroadcastRecipients.mockReset().mockResolvedValue({ recipients: [], totalEligible: 0 });
    mocks.createBroadcast.mockReset().mockResolvedValue({ ...createdBroadcast, total: 0, status: "COMPLETED" });
    mocks.getMessagingWindow.mockReset().mockResolvedValue(null);
    mocks.incrementBroadcastCounters.mockReset();
    mocks.finalizeBroadcastIfDone.mockReset();
    mocks.ensureOutboundDelivery.mockReset().mockImplementation(async (input) => ({ ...input, id: input.deliveryKey, state: "PENDING" }));
    mocks.claimOutboundDelivery.mockReset().mockResolvedValue({ claimed: true, record: { state: "CLAIMED" } });
    mocks.failOutboundDelivery.mockReset().mockResolvedValue(true);
    mocks.reconcileBroadcastCounters.mockReset().mockResolvedValue({ total: 2, sent: 0, failed: 1, skipped: 0, pending: 1 });
    mocks.reserveMonthlyBroadcast.mockReset().mockResolvedValue({ reserved: true, used: 1 });
    mocks.releaseMonthlyBroadcast.mockReset().mockResolvedValue(undefined);
    mocks.enqueueBroadcastSends.mockReset().mockResolvedValue({ accepted: [], rejected: [] });
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
    mocks.getEffectiveEntitlements.mockReset().mockResolvedValue({ monthlyBroadcastLimit: 4 });
  });

  it("rejects a revoked session before listing broadcasts", async () => {
    const response = await GET(new Request("http://localhost/api/broadcasts"));
    expect(response.status).toBe(401);
    expect(mocks.listBroadcasts).not.toHaveBeenCalled();
  });

  it("rejects a revoked session before fan-out", async () => {
    const response = await create();
    expect(response.status).toBe(401);
    expect(mocks.listBroadcastRecipients).not.toHaveBeenCalled();
    expect(mocks.enqueueBroadcastSends).not.toHaveBeenCalled();
  });

  it("refuses a plain member", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_2", email: "member@linkar.in", workspaceId: "workspace_1" });
    mocks.getMemberRole.mockResolvedValue("MEMBER");

    const response = await create();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(mocks.listBroadcastRecipients).not.toHaveBeenCalled();
  });

  it("answers invalid input with a readable message, not the raw Zod issue array", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });

    const response = await create({ name: "", text: "Hello", segment: "all_contacts" });
    const body = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("name");
    expect(body.error).not.toContain("\"code\"");
  });

  it("counts only recipients rejected by a partially successful fan-out", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.listBroadcastRecipients.mockResolvedValue({
      recipients: [
        { instagramAccountId: "ig_a", igScopedUserId: "recipient_a" },
        { instagramAccountId: "ig_b", igScopedUserId: "recipient_b" },
      ],
      totalEligible: 2,
    });
    mocks.createBroadcast.mockResolvedValue(createdBroadcast);
    mocks.enqueueBroadcastSends.mockResolvedValue({
      accepted: [{ igAccountId: "ig_a", igScopedUserId: "recipient_a" }],
      rejected: [{ igAccountId: "ig_b", igScopedUserId: "recipient_b" }],
    });

    const response = await create();

    expect(response.status).toBe(502);
    expect(mocks.ensureOutboundDelivery).toHaveBeenCalledTimes(2);
    expect(mocks.failOutboundDelivery).toHaveBeenCalledTimes(1);
    expect(mocks.reconcileBroadcastCounters).toHaveBeenCalledWith("workspace_1", "broadcast_1");
    expect(mocks.incrementBroadcastCounters).not.toHaveBeenCalled();
  });

  it("reports how many eligible recipients the per-broadcast cap left out", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.listBroadcastRecipients.mockResolvedValue({
      recipients: [
        { instagramAccountId: "ig_a", igScopedUserId: "recipient_a" },
        { instagramAccountId: "ig_a", igScopedUserId: "recipient_b" },
      ],
      totalEligible: 740,
    });
    mocks.createBroadcast.mockResolvedValue(createdBroadcast);

    const response = await create();

    expect(response.status).toBe(201);
    expect((await response.json()).audience).toEqual({ eligible: 740, queued: 2, truncated: true });
    expect(mocks.listBroadcastRecipients).toHaveBeenCalledWith("workspace_1", "all_contacts", 500);
  });

  it("enforces the monthly limit through the atomic reservation, not a row count", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.reserveMonthlyBroadcast.mockResolvedValue({ reserved: false, used: 4 });

    const response = await create();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "limit_reached", capability: "broadcasts", used: 4, limit: 4 });
    expect(mocks.reserveMonthlyBroadcast).toHaveBeenCalledWith("workspace_1", expect.stringMatching(/^\d{4}-\d{2}-01$/), 4);
    expect(mocks.createBroadcast).not.toHaveBeenCalled();
    expect(mocks.listBroadcasts).not.toHaveBeenCalled();
  });

  it("gives the reservation back when the broadcast row cannot be created", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.createBroadcast.mockRejectedValue(new Error("db down"));

    await expect(create()).rejects.toThrow("db down");
    expect(mocks.releaseMonthlyBroadcast).toHaveBeenCalledWith("workspace_1", expect.stringMatching(/-01$/));
  });

  it("returns the literal broadcast-feature contract", async () => {
    const { EntitlementError } = await import("@/src/lib/entitlements/service");
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.assertEntitled.mockRejectedValue(new EntitlementError("entitlement_required", "broadcasts"));

    const response = await create();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "entitlement_required", capability: "broadcasts" });
  });
});
