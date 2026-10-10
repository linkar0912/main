import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createPrismaBillingWebhookRepository, createWebhookProcessor, entitlementPlanForEvent, isStaleProviderEvent, normalizeRazorpaySubscriptionEvent, WebhookError } = await import("./webhook");
type NormalizedRazorpayEvent = import("./webhook").NormalizedRazorpayEvent;

function known(event: NormalizedRazorpayEvent | null) {
  return { ...event!, linkarPlanId: event!.linkarPlanId! };
}

const env = {
  razorpay: {
    webhookSecret: "webhook-secret",
    planIds: {
      creator: { MONTHLY: "plan_creator_monthly", ANNUAL: "plan_creator_annual" },
      growth: { MONTHLY: "plan_growth_monthly", ANNUAL: "plan_growth_annual" },
      agency: { MONTHLY: "plan_agency_monthly", ANNUAL: "plan_agency_annual" },
    },
  },
};

function body(event = "subscription.activated", overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(JSON.stringify({
    event,
    created_at: 1_788_528_000,
    payload: {
      subscription: {
        entity: {
          id: "sub_1",
          plan_id: "plan_creator_monthly",
          customer_id: "cust_1",
          status: event.split(".")[1],
          current_start: 1_788_528_000,
          current_end: 1_791_120_000,
          notes: { workspace_id: "ws_1", attempt_id: "attempt_1" },
          ...overrides,
        },
      },
    },
  }));
}

function signature(rawBody: Buffer): string {
  return createHmac("sha256", "webhook-secret").update(rawBody).digest("hex");
}

describe("Razorpay webhook processing", () => {
  it("classifies only a duplicate receipt insert as a duplicate webhook", async () => {
    const duplicate = Object.assign(new Error("unique conflict"), { code: "P2002" });
    const input = {
      ...normalizeRazorpaySubscriptionEvent(JSON.parse(body().toString("utf8")), env)!,
      eventId: "evt_1", payloadHash: "a".repeat(64), now: new Date("2026-09-04T12:00:00Z"),
    };
    const duplicateClient = {
      $transaction: (operation: (tx: unknown) => unknown) => operation({
        billingWebhookEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockRejectedValue(duplicate) },
      }),
    };
    await expect(createPrismaBillingWebhookRepository(duplicateClient as never).applyEvent(input))
      .resolves.toEqual({ outcome: "duplicate" });

    const downstreamClient = {
      $transaction: (operation: (tx: unknown) => unknown) => operation({
        billingWebhookEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "receipt_1" }) },
        billingSubscription: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockRejectedValue(duplicate) },
        billingCheckoutAttempt: { findFirst: vi.fn().mockResolvedValue({ workspaceId: "ws_1", planId: "plan_creator" }) },
        workspaceEntitlement: { findUnique: vi.fn().mockResolvedValue({ planId: "plan_free" }) },
      }),
    };
    await expect(createPrismaBillingWebhookRepository(downstreamClient as never).applyEvent(input))
      .rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects a signed payload replayed under a mutated event id", async () => {
    const input = {
      ...normalizeRazorpaySubscriptionEvent(JSON.parse(body().toString("utf8")), env)!,
      eventId: "evt_mutated", payloadHash: "b".repeat(64), now: new Date("2026-09-04T12:00:00Z"),
    };
    const create = vi.fn();
    const client = {
      $transaction: (operation: (tx: unknown) => unknown) => operation({
        billingWebhookEvent: { findFirst: vi.fn().mockResolvedValue({ id: "receipt_1" }), create },
      }),
    };

    await expect(createPrismaBillingWebhookRepository(client as never).applyEvent(input))
      .resolves.toEqual({ outcome: "duplicate" });
    expect(create).not.toHaveBeenCalled();
  });

  it("normalizes only the subscription fields Linkar needs", () => {
    const normalized = normalizeRazorpaySubscriptionEvent(JSON.parse(body().toString("utf8")), env);
    expect(normalized).toMatchObject({
      eventType: "subscription.activated",
      subscriptionId: "sub_1",
      linkarPlanId: "plan_creator",
      interval: "MONTHLY",
      providerStatus: "activated",
      workspaceId: "ws_1",
      attemptId: "attempt_1",
    });
    expect(normalized).not.toHaveProperty("payload");
  });

  it("ignores unknown event types but rejects malformed relevant events", () => {
    expect(normalizeRazorpaySubscriptionEvent({ event: "payment.authorized" }, env)).toBeNull();
    expect(() => normalizeRazorpaySubscriptionEvent({ event: "subscription.activated", payload: {} }, env)).toThrow("invalid_webhook_payload");
  });

  it("reconciles Razorpay's subscription.updated event without granting a plan early", () => {
    const updated = normalizeRazorpaySubscriptionEvent(JSON.parse(body("subscription.updated", { status: "active" }).toString("utf8")), env);

    expect(updated).toMatchObject({
      eventType: "subscription.updated",
      providerStatus: "active",
      status: "ACTIVE",
      linkarPlanId: "plan_creator",
    });
    expect(entitlementPlanForEvent(known(updated), "plan_growth", new Date("2026-09-04T12:00:00Z"))).toBe("plan_growth");
  });

  it("grants paid access only for activated or charged events", () => {
    const active = normalizeRazorpaySubscriptionEvent(JSON.parse(body().toString("utf8")), env)!;
    const authenticated = normalizeRazorpaySubscriptionEvent(JSON.parse(body("subscription.authenticated").toString("utf8")), env)!;
    expect(entitlementPlanForEvent(known(active), "plan_free", new Date("2026-09-04T12:00:00Z"))).toBe("plan_creator");
    expect(entitlementPlanForEvent(known(authenticated), "plan_free", new Date("2026-09-04T12:00:00Z"))).toBe("plan_free");
  });

  it("retains paid access through paid-through and returns to Free afterward", () => {
    const cancelled = normalizeRazorpaySubscriptionEvent(JSON.parse(body("subscription.cancelled").toString("utf8")), env)!;
    expect(entitlementPlanForEvent(known(cancelled), "plan_creator", new Date("2026-09-20T00:00:00Z"))).toBe("plan_creator");
    expect(entitlementPlanForEvent(known(cancelled), "plan_creator", new Date("2026-10-10T00:00:00Z"))).toBe("plan_free");
  });

  it("rejects older events and orders same-second events by lifecycle, never by event id", () => {
    const lastAt = new Date("2026-09-04T12:00:00Z");
    expect(isStaleProviderEvent(lastAt, "CANCELLED", new Date("2026-09-04T11:59:59Z"), "EXPIRED")).toBe(true);
    expect(isStaleProviderEvent(lastAt, "ACTIVE", new Date("2026-09-04T12:00:01Z"), "AUTHENTICATED")).toBe(false);
    // activated + charged commonly share a second: equal precedence always applies.
    expect(isStaleProviderEvent(lastAt, "ACTIVE", lastAt, "ACTIVE")).toBe(false);
    expect(isStaleProviderEvent(lastAt, "AUTHENTICATED", lastAt, "ACTIVE")).toBe(false);
    expect(isStaleProviderEvent(lastAt, "ACTIVE", lastAt, "AUTHENTICATED")).toBe(true);
    expect(isStaleProviderEvent(lastAt, "ACTIVE", lastAt, "PENDING")).toBe(false);
    expect(isStaleProviderEvent(lastAt, "HALTED", lastAt, "PENDING")).toBe(true);
    expect(isStaleProviderEvent(lastAt, "CANCELLED", lastAt, "ACTIVE")).toBe(true);
    expect(isStaleProviderEvent(lastAt, "CANCELLED", lastAt, "COMPLETED")).toBe(false);
    expect(isStaleProviderEvent(null, null, lastAt, "AUTHENTICATED")).toBe(false);
  });

  it("treats a lapsed status reported by subscription.updated like its own event", () => {
    const updated = known(normalizeRazorpaySubscriptionEvent(JSON.parse(body("subscription.updated", { status: "halted" }).toString("utf8")), env));
    expect(entitlementPlanForEvent(updated, "plan_creator", new Date("2026-09-20T00:00:00Z"))).toBe("plan_creator");
    expect(entitlementPlanForEvent(updated, "plan_creator", new Date("2026-10-10T00:00:00Z"))).toBe("plan_free");
  });

  it("normalizes an unknown Razorpay plan id instead of rejecting the event", () => {
    const normalized = normalizeRazorpaySubscriptionEvent(JSON.parse(body("subscription.charged", { plan_id: "plan_retired" }).toString("utf8")), env);
    expect(normalized).toMatchObject({ providerPlanId: "plan_retired", linkarPlanId: null, interval: null });
  });

  it("verifies exact raw bytes and invalidates only after an applied event", async () => {
    const applyEvent = vi.fn().mockResolvedValue({ outcome: "applied", workspaceId: "ws_1" });
    const invalidate = vi.fn();
    const processor = createWebhookProcessor({ repository: { applyEvent }, env, invalidate, now: () => new Date("2026-09-04T12:00:00Z") });
    const rawBody = body();

    await expect(processor.process({ eventId: "evt_1", rawBody, signature: signature(rawBody) })).resolves.toEqual({ outcome: "applied" });
    expect(applyEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: "evt_1", payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    expect(invalidate).toHaveBeenCalledWith("ws_1");

    await expect(processor.process({ eventId: "evt_2", rawBody, signature: "0".repeat(64) })).rejects.toEqual(new WebhookError("invalid_webhook_signature"));
  });
});

type FakeSubscription = Record<string, unknown> & {
  workspaceId: string; providerSubscriptionId: string | null; planId: string; status: string;
  lastProviderEventAt: Date | null;
};

/** In-memory stand-in for the handful of Prisma calls applyEvent makes. */
function fakeBillingStore(seed: {
  subscription?: Partial<FakeSubscription>;
  attempts?: Array<{ id: string; workspaceId: string; planId: string; providerSubscriptionId: string }>;
  planId?: string;
} = {}) {
  const receipts: Array<Record<string, unknown>> = [];
  const subscriptions = new Map<string, FakeSubscription>();
  if (seed.subscription) {
    subscriptions.set("ws_1", {
      id: "billing_1", workspaceId: "ws_1", providerSubscriptionId: "sub_1", planId: "plan_creator", interval: "MONTHLY",
      providerPlanId: "plan_creator_monthly", status: "ACTIVE", lastProviderEventAt: null, ...seed.subscription,
    });
  }
  const attempts = seed.attempts ?? [{ id: "attempt_1", workspaceId: "ws_1", planId: "plan_creator", providerSubscriptionId: "sub_1" }];
  const entitlements = new Map([["ws_1", { workspaceId: "ws_1", planId: seed.planId ?? "plan_free" }]]);
  const transaction = {
    billingWebhookEvent: {
      findFirst: async ({ where }: { where: { payloadHash: string } }) => receipts.find((receipt) => receipt.payloadHash === where.payloadHash) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (receipts.some((receipt) => receipt.eventId === data.eventId)) throw Object.assign(new Error("unique"), { code: "P2002" });
        receipts.push({ ...data, state: "RECEIVED" });
        return { id: data.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        Object.assign(receipts.find((receipt) => receipt.id === where.id)!, data);
      },
    },
    billingSubscription: {
      findUnique: async ({ where }: { where: { providerSubscriptionId?: string; workspaceId?: string } }) => {
        if (where.workspaceId) return subscriptions.get(where.workspaceId) ?? null;
        return [...subscriptions.values()].find((row) => row.providerSubscriptionId === where.providerSubscriptionId) ?? null;
      },
      upsert: async ({ where, create, update }: { where: { workspaceId: string }; create: FakeSubscription; update: Record<string, unknown> }) => {
        const existing = subscriptions.get(where.workspaceId);
        if (!existing) subscriptions.set(where.workspaceId, { ...create });
        else for (const [key, value] of Object.entries(update)) if (value !== undefined) existing[key] = value;
      },
    },
    billingCheckoutAttempt: {
      findFirst: async ({ where }: { where: { id?: string; providerSubscriptionId?: string } }) =>
        attempts.find((attempt) => where.id ? attempt.id === where.id : attempt.providerSubscriptionId === where.providerSubscriptionId) ?? null,
    },
    workspaceEntitlement: {
      findUnique: async ({ where }: { where: { workspaceId: string } }) => entitlements.get(where.workspaceId) ?? null,
      update: async ({ where, data }: { where: { workspaceId: string }; data: { planId: string } }) => {
        entitlements.get(where.workspaceId)!.planId = data.planId;
      },
      create: async ({ data }: { data: { workspaceId: string; planId: string } }) => { entitlements.set(data.workspaceId, data); },
    },
    adminAuditEvent: { create: vi.fn() },
  };
  const client = { $transaction: vi.fn((operation: (tx: unknown) => unknown) => operation(transaction)) };
  return {
    repository: createPrismaBillingWebhookRepository(client as never),
    client,
    receipts,
    subscription: () => subscriptions.get("ws_1"),
    plan: () => entitlements.get("ws_1")!.planId,
  };
}

let eventCounter = 0;
function event(type: string, overrides: Record<string, unknown> = {}, createdAt = 1_788_528_000, now = "2026-09-04T12:00:00Z") {
  eventCounter += 1;
  const raw = JSON.parse(body(type, overrides).toString("utf8"));
  raw.created_at = createdAt;
  return {
    ...normalizeRazorpaySubscriptionEvent(raw, env)!,
    eventId: `evt_${eventCounter}`, payloadHash: String(eventCounter).padStart(64, "0"), now: new Date(now),
  };
}

describe("Razorpay webhook state transitions", () => {
  it("applies activated and charged that share a second, in either order", async () => {
    for (const order of [["subscription.activated", "subscription.charged"], ["subscription.charged", "subscription.activated"]]) {
      const store = fakeBillingStore();
      await expect(store.repository.applyEvent(event(order[0]))).resolves.toMatchObject({ outcome: "applied" });
      await expect(store.repository.applyEvent(event(order[1]))).resolves.toMatchObject({ outcome: "applied" });
      expect(store.plan()).toBe("plan_creator");
      expect(store.subscription()).toMatchObject({ status: "ACTIVE" });
    }
  });

  it("drops a same-second authenticated that arrives after the activation", async () => {
    const store = fakeBillingStore();
    await store.repository.applyEvent(event("subscription.activated"));
    await expect(store.repository.applyEvent(event("subscription.authenticated"))).resolves.toMatchObject({ outcome: "stale" });
    expect(store.subscription()).toMatchObject({ status: "ACTIVE" });
    expect(store.receipts.at(-1)).toMatchObject({ state: "IGNORED" });
  });

  it("ignores a late cancel of an old subscription while the workspace pays for a newer one", async () => {
    const store = fakeBillingStore({
      planId: "plan_growth",
      subscription: { providerSubscriptionId: "sub_2", planId: "plan_growth", status: "ACTIVE", lastProviderEventAt: new Date("2026-09-10T00:00:00Z") },
      attempts: [{ id: "attempt_1", workspaceId: "ws_1", planId: "plan_creator", providerSubscriptionId: "sub_1" }],
    });
    const lateCancel = event("subscription.cancelled", { current_end: 1_788_600_000 }, 1_788_528_000, "2026-09-20T00:00:00Z");

    await expect(store.repository.applyEvent(lateCancel)).resolves.toEqual({ outcome: "ignored" });
    expect(store.plan()).toBe("plan_growth");
    expect(store.subscription()).toMatchObject({ providerSubscriptionId: "sub_2", status: "ACTIVE" });
    expect(store.receipts.at(-1)).toMatchObject({ state: "IGNORED", workspaceId: "ws_1" });
  });

  it("lets a new live subscription replace a terminal one, but not an old one's late events", async () => {
    const store = fakeBillingStore({
      subscription: { providerSubscriptionId: "sub_0", status: "CANCELLED", lastProviderEventAt: new Date("2026-09-01T00:00:00Z") },
    });
    await expect(store.repository.applyEvent(event("subscription.activated"))).resolves.toMatchObject({ outcome: "applied" });
    expect(store.subscription()).toMatchObject({ providerSubscriptionId: "sub_1", status: "ACTIVE" });
    expect(store.plan()).toBe("plan_creator");

    const terminal = fakeBillingStore({
      subscription: { providerSubscriptionId: "sub_2", status: "CANCELLED", lastProviderEventAt: new Date("2026-09-10T00:00:00Z") },
    });
    await expect(terminal.repository.applyEvent(event("subscription.completed"))).resolves.toEqual({ outcome: "ignored" });
    await expect(terminal.repository.applyEvent(event("subscription.charged"))).resolves.toEqual({ outcome: "ignored" });
    expect(terminal.subscription()).toMatchObject({ providerSubscriptionId: "sub_2" });
  });

  it("keeps the stored plan when a known subscription reports an unmapped plan id", async () => {
    const store = fakeBillingStore({
      planId: "plan_creator",
      subscription: { providerSubscriptionId: "sub_1", planId: "plan_creator", status: "ACTIVE", lastProviderEventAt: new Date("2026-09-01T00:00:00Z") },
    });
    await expect(store.repository.applyEvent(event("subscription.charged", { plan_id: "plan_retired" }))).resolves.toMatchObject({ outcome: "applied" });
    expect(store.plan()).toBe("plan_creator");
    expect(store.subscription()).toMatchObject({ planId: "plan_creator", interval: "MONTHLY", providerPlanId: "plan_creator_monthly" });
  });

  it("records an unmapped plan id for an unknown subscription as ignored and answers 200-style", async () => {
    const store = fakeBillingStore();
    await expect(store.repository.applyEvent(event("subscription.activated", { plan_id: "plan_retired" }))).resolves.toEqual({ outcome: "ignored" });
    expect(store.plan()).toBe("plan_free");
    expect(store.receipts.at(-1)).toMatchObject({ state: "IGNORED" });

    const invalidate = vi.fn();
    const processor = createWebhookProcessor({ repository: store.repository, env, invalidate, now: () => new Date("2026-09-04T12:00:00Z") });
    const rawBody = body("subscription.charged", { plan_id: "plan_retired", id: "sub_unknown", notes: {} });
    await expect(processor.process({ eventId: "evt_unknown_plan", rawBody, signature: signature(rawBody) })).resolves.toEqual({ outcome: "ignored" });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("downgrades on a lapsed subscription.updated once the paid period has ended", async () => {
    const store = fakeBillingStore({
      planId: "plan_creator",
      subscription: { providerSubscriptionId: "sub_1", status: "ACTIVE", lastProviderEventAt: new Date("2026-09-01T00:00:00Z") },
    });
    await store.repository.applyEvent(event("subscription.updated", { status: "cancelled" }, 1_788_528_000, "2026-10-10T00:00:00Z"));
    expect(store.plan()).toBe("plan_free");
    expect(store.subscription()).toMatchObject({ status: "CANCELLED" });
  });

  it("retries serialization conflicts and gives up after four attempts", async () => {
    const conflict = Object.assign(new Error("serialization failure"), { code: "P2034" });
    const store = fakeBillingStore();
    const original = store.client.$transaction.getMockImplementation()!;
    store.client.$transaction.mockRejectedValueOnce(conflict).mockRejectedValueOnce(conflict).mockImplementation(original);
    await expect(store.repository.applyEvent(event("subscription.activated"))).resolves.toMatchObject({ outcome: "applied" });
    expect(store.client.$transaction).toHaveBeenCalledTimes(3);

    const failing = fakeBillingStore();
    failing.client.$transaction.mockRejectedValue(conflict);
    await expect(failing.repository.applyEvent(event("subscription.activated"))).rejects.toMatchObject({ code: "P2034" });
    expect(failing.client.$transaction).toHaveBeenCalledTimes(4);
  });
});
