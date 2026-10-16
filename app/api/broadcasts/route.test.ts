import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import { createPrismaRepository, prisma } from "@/src/lib/prisma";
import type { EnsureOutboundDeliveryInput } from "@/src/lib/repository";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getMemberRole: vi.fn(),
  listBroadcasts: vi.fn(),
  listBroadcastRecipients: vi.fn(),
  createBroadcast: vi.fn(),
  getBroadcast: vi.fn(),
  getMessagingWindow: vi.fn(),
  incrementBroadcastCounters: vi.fn(),
  finalizeBroadcastIfDone: vi.fn(),
  ensureOutboundDeliveries: vi.fn(),
  cancelBroadcast: vi.fn(),
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
    getBroadcast: mocks.getBroadcast,
    getMessagingWindow: mocks.getMessagingWindow,
    incrementBroadcastCounters: mocks.incrementBroadcastCounters,
    finalizeBroadcastIfDone: mocks.finalizeBroadcastIfDone,
    ensureOutboundDeliveries: mocks.ensureOutboundDeliveries,
    cancelBroadcast: mocks.cancelBroadcast,
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

function create(body: unknown = { name: "Update", text: "Hello", segment: "all_contacts" }, idempotencyKey?: string) {
  return POST(new Request("http://localhost/api/broadcasts", {
    method: "POST",
    headers: { "content-type": "application/json", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
    body: JSON.stringify(body),
  }));
}

const DERIVED_BROADCAST_ID = /^broadcast_[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
    mocks.getBroadcast.mockReset().mockResolvedValue(null);
    mocks.getMessagingWindow.mockReset().mockResolvedValue(null);
    mocks.incrementBroadcastCounters.mockReset();
    mocks.finalizeBroadcastIfDone.mockReset();
    mocks.ensureOutboundDeliveries.mockReset().mockImplementation(async (inputs: EnsureOutboundDeliveryInput[]) =>
      inputs.map((input) => ({ ...input, id: input.deliveryKey, state: "PENDING" })));
    mocks.cancelBroadcast.mockReset().mockResolvedValue({ status: "cancelled", broadcast: { ...createdBroadcast, status: "CANCELLED" } });
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
    expect(mocks.ensureOutboundDeliveries).toHaveBeenCalledTimes(1);
    expect(mocks.ensureOutboundDeliveries.mock.calls[0][0]).toHaveLength(2);
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

  it("stores 500 deliveries with one batched insert and one read, then queues all of them", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    const recipients = Array.from({ length: 500 }, (_, index) => ({ instagramAccountId: "ig_a", igScopedUserId: `person_${index}` }));
    mocks.listBroadcastRecipients.mockResolvedValue({ recipients, totalEligible: 500 });
    mocks.createBroadcast.mockResolvedValue({ ...createdBroadcast, total: 500 });
    const createMany = vi.fn().mockResolvedValue({ count: 500 });
    const findMany = vi.fn(async ({ where }: { where: { deliveryKey: { in: string[] } } }) => where.deliveryKey.in.map((deliveryKey) => ({
      id: `delivery_${deliveryKey}`,
      deliveryKey,
      workspaceId: "workspace_1",
      kind: "BROADCAST_RECIPIENT",
      recipientId: null,
      instagramAccountId: "ig_a",
      automationId: null,
      participantId: null,
      sequenceEnrollmentId: null,
      broadcastId: "broadcast_1",
      payload: { type: "text", text: "Hello" },
      state: "PENDING",
      retryable: false,
      resultCode: null,
      claimOwner: null,
      claimExpiresAt: null,
      attemptCount: 0,
      providerMessageId: null,
      lastError: null,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      sentAt: null,
    })).reverse());
    const client = { outboundDelivery: { createMany, findMany } } as unknown as typeof prisma;
    mocks.ensureOutboundDeliveries.mockImplementation(createPrismaRepository(client).ensureOutboundDeliveries);

    const response = await create();

    expect(response.status).toBe(201);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(createMany.mock.calls[0][0].data).toHaveLength(500);
    expect(findMany).toHaveBeenCalledTimes(1);
    const [jobs] = mocks.enqueueBroadcastSends.mock.calls[0];
    expect(jobs).toHaveLength(500);
    // Each job carries its own person's delivery, whatever order the read returned.
    expect(jobs[0]).toMatchObject({ igScopedUserId: "person_0", deliveryKey: expect.stringContaining("person_0") });
    expect(jobs[499]).toMatchObject({ igScopedUserId: "person_499", deliveryKey: expect.stringContaining("person_499") });
  });

  it("closes the broadcast and gives the reservation back when its deliveries cannot be stored", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.listBroadcastRecipients.mockResolvedValue({
      recipients: [{ instagramAccountId: "ig_a", igScopedUserId: "recipient_a" }],
      totalEligible: 1,
    });
    mocks.createBroadcast.mockResolvedValue(createdBroadcast);
    mocks.ensureOutboundDeliveries.mockRejectedValue(new Error("pool timeout"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await create();

    // queued: 0 lets the screen start a fresh send instead of replaying this closed one.
    expect(response.status).toBe(500);
    const body = await response.json() as { error: string; queued?: number };
    expect(body.queued).toBe(0);
    expect(body.error).toMatch(/nobody was messaged/);
    expect(body.error).not.toMatch(/pool timeout/);
    expect(errorLog).toHaveBeenCalled();
    expect(mocks.cancelBroadcast).toHaveBeenCalledWith("workspace_1", "broadcast_1");
    expect(mocks.releaseMonthlyBroadcast).toHaveBeenCalledWith("workspace_1", expect.stringMatching(/-01$/));
    expect(mocks.enqueueBroadcastSends).not.toHaveBeenCalled();
    // Counts come up to date after the close, so a lost-answer retry replays a broadcast that reached nobody.
    expect(mocks.reconcileBroadcastCounters).toHaveBeenCalledWith("workspace_1", "broadcast_1");
    errorLog.mockRestore();
  });

  it("leaves the counts alone when the broadcast could not be closed after its deliveries failed to store", async () => {
    // A recount of a running row with no deliveries would mark it finished
    // with nobody to send to, and a retry would replay that as sent.
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.listBroadcastRecipients.mockResolvedValue({
      recipients: [{ instagramAccountId: "ig_a", igScopedUserId: "recipient_a" }],
      totalEligible: 1,
    });
    mocks.createBroadcast.mockResolvedValue(createdBroadcast);
    mocks.ensureOutboundDeliveries.mockRejectedValue(new Error("pool timeout"));
    mocks.cancelBroadcast.mockRejectedValue(new Error("db down"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await create();

    expect(response.status).toBe(500);
    expect(mocks.reconcileBroadcastCounters).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  describe("when the queue takes nobody", () => {
    const twoPeople = {
      recipients: [
        { instagramAccountId: "ig_a", igScopedUserId: "recipient_a" },
        { instagramAccountId: "ig_b", igScopedUserId: "recipient_b" },
      ],
      totalEligible: 2,
    };
    const rejectEveryone = async (jobs: { igAccountId: string; igScopedUserId: string }[]) => ({
      accepted: [],
      rejected: jobs.map(({ igAccountId, igScopedUserId }) => ({ igAccountId, igScopedUserId })),
    });

    beforeEach(() => {
      mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
      mocks.listBroadcastRecipients.mockResolvedValue(twoPeople);
      mocks.createBroadcast.mockResolvedValue(createdBroadcast);
      mocks.enqueueBroadcastSends.mockImplementation(rejectEveryone);
    });

    it("closes the broadcast, gives the month's broadcast back and answers queued: 0", async () => {
      const warnLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const response = await create();

      expect(response.status).toBe(503);
      const body = await response.json() as { error: string; queued?: number; data: { status: string } };
      expect(body.queued).toBe(0);
      expect(body.error).toMatch(/nobody was messaged/);
      expect(body.error).not.toMatch(/recipient|partial/i);
      expect(body.data.status).toBe("CANCELLED");
      expect(mocks.cancelBroadcast).toHaveBeenCalledWith("workspace_1", "broadcast_1");
      expect(mocks.releaseMonthlyBroadcast).toHaveBeenCalledWith("workspace_1", expect.stringMatching(/-01$/));
      // Not recorded as a finished broadcast with everyone failed. The counts
      // are brought up to date after the close, so the cancelled deliveries
      // count as skipped and a same-key replay reads as reaching nobody.
      expect(mocks.failOutboundDelivery).not.toHaveBeenCalled();
      expect(mocks.reconcileBroadcastCounters).toHaveBeenCalledWith("workspace_1", "broadcast_1");
      expect(mocks.reconcileBroadcastCounters.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.cancelBroadcast.mock.invocationCallOrder[0]);
      warnLog.mockRestore();
    });

    it("lets a fresh key send for real once the queue is back, and a same-key retry gets the closed broadcast", async () => {
      const memory = createMemoryRepository();
      mocks.createBroadcast.mockImplementation(memory.createBroadcast);
      mocks.getBroadcast.mockImplementation(memory.getBroadcast);
      mocks.cancelBroadcast.mockImplementation(memory.cancelBroadcast);
      const warnLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const first = await create(undefined, "send-key-down");
      expect(first.status).toBe(503);
      const firstId = (await first.json() as { data: { id: string } }).data.id;
      expect(await memory.getBroadcast("workspace_1", firstId)).toMatchObject({ status: "CANCELLED", sent: 0 });

      // Queue back.
      mocks.enqueueBroadcastSends.mockImplementation(async (jobs: { igAccountId: string; igScopedUserId: string }[]) => ({
        accepted: jobs.map(({ igAccountId, igScopedUserId }) => ({ igAccountId, igScopedUserId })),
        rejected: [],
      }));
      const sameKey = await create(undefined, "send-key-down");
      expect(sameKey.status).toBe(200);
      await expect(sameKey.json()).resolves.toMatchObject({ replayed: true, data: { id: firstId, status: "CANCELLED", sent: 0 } });

      const freshKey = await create(undefined, "send-key-up");
      expect(freshKey.status).toBe(201);
      expect((await freshKey.json() as { data: { id: string } }).data.id).not.toBe(firstId);
      expect(mocks.enqueueBroadcastSends).toHaveBeenCalledTimes(2);
      // The failed try gave its slot back, so the month counts one broadcast.
      expect(mocks.reserveMonthlyBroadcast).toHaveBeenCalledTimes(2);
      expect(mocks.releaseMonthlyBroadcast).toHaveBeenCalledTimes(1);
      warnLog.mockRestore();
    });

    it("records everyone as failed, as before, when the broadcast cannot be closed", async () => {
      mocks.cancelBroadcast.mockRejectedValue(new Error("db down"));

      const response = await create();

      expect(response.status).toBe(502);
      expect(mocks.failOutboundDelivery).toHaveBeenCalledTimes(2);
      expect(mocks.reconcileBroadcastCounters).toHaveBeenCalledWith("workspace_1", "broadcast_1");
      expect(mocks.releaseMonthlyBroadcast).not.toHaveBeenCalled();
    });
  });

  describe("idempotency key", () => {
    const twoPeople = {
      recipients: [
        { instagramAccountId: "ig_a", igScopedUserId: "recipient_a" },
        { instagramAccountId: "ig_b", igScopedUserId: "recipient_b" },
      ],
      totalEligible: 2,
    };

    /** Broadcast rows live in a real memory repository, so the second
     * attempt finds what the first one stored. */
    function useStoredBroadcasts() {
      const memory = createMemoryRepository();
      mocks.createBroadcast.mockImplementation(memory.createBroadcast);
      mocks.getBroadcast.mockImplementation(memory.getBroadcast);
      return memory;
    }

    beforeEach(() => {
      mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
      mocks.listBroadcastRecipients.mockResolvedValue(twoPeople);
      mocks.enqueueBroadcastSends.mockImplementation(async (jobs: { igAccountId: string; igScopedUserId: string }[]) => ({
        accepted: jobs.map(({ igAccountId, igScopedUserId }) => ({ igAccountId, igScopedUserId })),
        rejected: [],
      }));
    });

    it("replays the trimmed name, text and segment the screen compares against", async () => {
      // The broadcasts screen tells an edited send from a plain retry by
      // comparing the replayed row with what it posted (trimmed). If a replay
      // stopped carrying these, an edited message could again be dropped.
      useStoredBroadcasts();
      const body = { name: "  Drop  ", text: " New stock \n", segment: "captured_email" };

      await create(body, "send-key-trim");
      const replay = await create(body, "send-key-trim");

      expect(replay.status).toBe(200);
      await expect(replay.json()).resolves.toMatchObject({
        replayed: true,
        data: { name: "Drop", text: "New stock", segment: "captured_email" },
      });
    });

    it("answers the same body and key twice with one broadcast and one reservation", async () => {
      useStoredBroadcasts();

      const first = await create(undefined, "send-key-1");
      const second = await create(undefined, "send-key-1");

      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      const firstBody = await first.json() as { data: { id: string } };
      const secondBody = await second.json() as { data: { id: string }; replayed?: boolean };
      expect(firstBody.data.id).toMatch(DERIVED_BROADCAST_ID);
      expect(secondBody).toMatchObject({ replayed: true, data: { id: firstBody.data.id } });
      expect(mocks.createBroadcast).toHaveBeenCalledTimes(1);
      expect(mocks.createBroadcast).toHaveBeenCalledWith("workspace_1", expect.objectContaining({ id: firstBody.data.id }));
      expect(mocks.reserveMonthlyBroadcast).toHaveBeenCalledTimes(1);
      expect(mocks.releaseMonthlyBroadcast).not.toHaveBeenCalled();
      expect(mocks.ensureOutboundDeliveries).toHaveBeenCalledTimes(1);
      expect(mocks.enqueueBroadcastSends).toHaveBeenCalledTimes(1);
      // The replay is answered before the audience query and the plan checks.
      expect(mocks.listBroadcastRecipients).toHaveBeenCalledTimes(1);
      expect(mocks.assertEntitled).toHaveBeenCalledTimes(1);
    });

    it("queues nobody twice when a partial-queue 502 is retried with the same key", async () => {
      useStoredBroadcasts();
      mocks.enqueueBroadcastSends.mockResolvedValueOnce({
        accepted: [{ igAccountId: "ig_a", igScopedUserId: "recipient_a" }],
        rejected: [{ igAccountId: "ig_b", igScopedUserId: "recipient_b" }],
      });

      const first = await create(undefined, "send-key-2");
      expect(first.status).toBe(502);
      const firstBody = await first.json() as { error: string; data: { id: string } };
      expect(firstBody.error).not.toMatch(/recipient/i);

      const retry = await create(undefined, "send-key-2");

      expect(retry.status).toBe(200);
      await expect(retry.json()).resolves.toMatchObject({ replayed: true, data: { id: firstBody.data.id } });
      expect(mocks.enqueueBroadcastSends).toHaveBeenCalledTimes(1);
      expect(mocks.ensureOutboundDeliveries).toHaveBeenCalledTimes(1);
      expect(mocks.failOutboundDelivery).toHaveBeenCalledTimes(1);
      expect(mocks.reserveMonthlyBroadcast).toHaveBeenCalledTimes(1);
      expect(mocks.createBroadcast).toHaveBeenCalledTimes(1);
    });

    it("hands back the winner's broadcast and gives the reservation back when a same-key attempt loses the create race", async () => {
      const memory = useStoredBroadcasts();
      // Both attempts passed the lookup before either stored its row.
      mocks.getBroadcast.mockResolvedValueOnce(null);
      mocks.createBroadcast.mockImplementationOnce(async (workspaceId: string, input: Parameters<typeof memory.createBroadcast>[1]) => {
        await memory.createBroadcast(workspaceId, input);
        return memory.createBroadcast(workspaceId, input);
      });

      const response = await create(undefined, "send-key-3");

      expect(response.status).toBe(200);
      const body = await response.json() as { data: { id: string }; replayed?: boolean };
      expect(body.replayed).toBe(true);
      expect(body.data.id).toMatch(DERIVED_BROADCAST_ID);
      expect(mocks.releaseMonthlyBroadcast).toHaveBeenCalledWith("workspace_1", expect.stringMatching(/-01$/));
      expect(mocks.ensureOutboundDeliveries).not.toHaveBeenCalled();
      expect(mocks.enqueueBroadcastSends).not.toHaveBeenCalled();
    });

    it("replays instead of refusing when a same-key attempt alongside it took the month's last broadcast", async () => {
      useStoredBroadcasts();
      const winner = await create(undefined, "send-key-4");
      expect(winner.status).toBe(201);
      const winnerId = (await winner.json() as { data: { id: string } }).data.id;

      // The other attempt's lookup ran before the winner stored its row, and
      // the winner's reservation used the last slot.
      mocks.getBroadcast.mockResolvedValueOnce(null);
      mocks.reserveMonthlyBroadcast.mockResolvedValueOnce({ reserved: false, used: 4 });
      const loser = await create(undefined, "send-key-4");

      expect(loser.status).toBe(200);
      await expect(loser.json()).resolves.toMatchObject({ replayed: true, data: { id: winnerId } });
      expect(mocks.createBroadcast).toHaveBeenCalledTimes(1);
      expect(mocks.enqueueBroadcastSends).toHaveBeenCalledTimes(1);
    });

    it("still refuses at the monthly limit when no same-key broadcast exists", async () => {
      useStoredBroadcasts();
      mocks.reserveMonthlyBroadcast.mockResolvedValue({ reserved: false, used: 4 });

      const response = await create(undefined, "send-key-5");

      expect(response.status).toBe(409);
      expect(mocks.getBroadcast).toHaveBeenCalledTimes(2);
      expect(mocks.createBroadcast).not.toHaveBeenCalled();
    });

    it("keys the derived id to the workspace, so another workspace's same key makes its own broadcast", async () => {
      useStoredBroadcasts();

      const first = await create(undefined, "shared-key");
      mocks.getValidatedSession.mockResolvedValue({ userId: "user_2", workspaceId: "workspace_2" });
      const second = await create(undefined, "shared-key");

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const [firstId, secondId] = mocks.createBroadcast.mock.calls.map(([, input]) => (input as { id?: string }).id);
      expect(firstId).toMatch(DERIVED_BROADCAST_ID);
      expect(secondId).toMatch(DERIVED_BROADCAST_ID);
      expect(secondId).not.toBe(firstId);
    });

    it.each([
      ["no header", undefined],
      ["a malformed header", "not a valid key!"],
    ])("keeps the old behaviour with %s: no lookup and a fresh id", async (_label, key) => {
      mocks.createBroadcast.mockResolvedValue(createdBroadcast);

      const response = await create(undefined, key);

      expect(response.status).toBe(201);
      expect(mocks.getBroadcast).not.toHaveBeenCalled();
      expect(mocks.createBroadcast.mock.calls[0][1]).not.toHaveProperty("id");
    });
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

describe("createBroadcast with a caller-supplied id", () => {
  const input = { name: "Update", text: "Hello", segment: "all_contacts" as const, total: 2 };

  it("memory: stores the given id and refuses a second create with it like a unique constraint", async () => {
    const memory = createMemoryRepository();

    const created = await memory.createBroadcast("workspace_1", { ...input, id: "broadcast_fixed" });

    expect(created.id).toBe("broadcast_fixed");
    expect(await memory.getBroadcast("workspace_1", "broadcast_fixed")).toEqual(created);
    await expect(memory.createBroadcast("workspace_1", { ...input, id: "broadcast_fixed" })).rejects.toMatchObject({ code: "P2002" });
    expect((await memory.createBroadcast("workspace_1", input)).id).toMatch(/^broadcast_/);
  });

  it("prisma: writes the given id, and a fresh one without it", async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data, sent: 0, failed: 0, skipped: 0, createdAt: new Date(0), completedAt: null, cancelledAt: null,
    }));
    const repository = createPrismaRepository({ broadcast: { create } } as unknown as typeof prisma);

    await repository.createBroadcast("workspace_1", { ...input, id: "broadcast_fixed" });
    await repository.createBroadcast("workspace_1", input);

    expect(create.mock.calls[0][0].data.id).toBe("broadcast_fixed");
    expect(create.mock.calls[1][0].data.id).toMatch(/^broadcast_/);
    expect(create.mock.calls[1][0].data.id).not.toBe("broadcast_fixed");
  });
});

describe("ensureOutboundDeliveries", () => {
  const input = (deliveryKey: string): EnsureOutboundDeliveryInput => ({
    deliveryKey,
    workspaceId: "workspace_1",
    kind: "BROADCAST_RECIPIENT",
    broadcastId: "broadcast_1",
    instagramAccountId: "ig_a",
    recipientId: deliveryKey,
    payload: { type: "text", text: "Hello" },
  });

  it("memory: returns stored rows in input order and keeps an existing row as it is", async () => {
    const memory = createMemoryRepository();
    const existing = await memory.ensureOutboundDelivery(input("key_b"));

    const records = await memory.ensureOutboundDeliveries([input("key_a"), input("key_b"), input("key_c"), input("key_a")]);

    expect(records.map((record) => record.deliveryKey)).toEqual(["key_a", "key_b", "key_c", "key_a"]);
    expect(records[1]).toEqual(existing);
    expect(records[3].id).toBe(records[0].id);
    expect(records[0]).toMatchObject({ state: "PENDING", attemptCount: 0, broadcastId: "broadcast_1" });
    expect(await memory.getOutboundDelivery("key_c")).toEqual(records[2]);
  });

  it("prisma: splits more than 500 rows into batches of 500", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 0 });
    const findMany = vi.fn(async ({ where }: { where: { deliveryKey: { in: string[] } } }) => where.deliveryKey.in.map((deliveryKey) => ({
      id: deliveryKey, deliveryKey, workspaceId: "workspace_1", kind: "BROADCAST_RECIPIENT", payload: {}, state: "PENDING", retryable: false,
      attemptCount: 0, createdAt: new Date(0), updatedAt: new Date(0),
    })));
    const client = { outboundDelivery: { createMany, findMany } } as unknown as typeof prisma;

    const records = await createPrismaRepository(client).ensureOutboundDeliveries(
      Array.from({ length: 1_001 }, (_, index) => input(`key_${index}`)),
    );

    expect(createMany.mock.calls.map(([args]) => args.data.length)).toEqual([500, 500, 1]);
    expect(findMany).toHaveBeenCalledTimes(3);
    expect(records).toHaveLength(1_001);
    expect(records[1_000].deliveryKey).toBe("key_1000");
  });

  it("prisma: fails loudly when a row is neither inserted nor found", async () => {
    const client = {
      outboundDelivery: { createMany: vi.fn().mockResolvedValue({ count: 0 }), findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as typeof prisma;
    await expect(createPrismaRepository(client).ensureOutboundDeliveries([input("key_a")])).rejects.toThrow("key_a");
  });
});
