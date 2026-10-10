import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getRepository: vi.fn(),
  sendDirectMessage: vi.fn(),
  executeOutboundDelivery: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: mocks.getRepository }));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ metaApiVersion: "v25.0", metaTokenEncryptionKey: "test-key" }) }));
vi.mock("@/src/lib/security/secrets", () => ({ unsealSecret: () => "plain-token" }));
vi.mock("@/src/lib/meta/client", () => ({ MetaClient: class { sendDirectMessage = mocks.sendDirectMessage; } }));
vi.mock("@/src/lib/automation/outbound-delivery", () => ({ executeOutboundDelivery: mocks.executeOutboundDelivery }));

import { GET, PATCH, POST } from "./route";

const current = new Date().toISOString();
const contact = {
  id: "contact_1",
  workspaceId: "workspace_1",
  instagramAccountId: "ig_1",
  igScopedUserId: "person_1",
  state: "NONE",
  attempts: 0,
  tags: [],
  score: 0,
  leadStatus: "NEW",
  inboxStatus: "OPEN",
  inboxFavorite: false,
  lastSeenAt: current,
  createdAt: current,
  updatedAt: current,
};
const inbound = {
  id: "event_1",
  providerEventId: "message_1",
  eventType: "message.received",
  receivedAt: current,
  payload: { accountId: "ig_1", recipientId: "person_1", text: "Hello" },
};

function context() {
  return { params: Promise.resolve({ contactId: "contact_1" }) };
}

describe("/api/inbox/[contactId]", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ workspaceId: "workspace_1", userId: "user_1" });
    mocks.sendDirectMessage.mockReset().mockResolvedValue({ message_id: "provider_1" });
    mocks.executeOutboundDelivery.mockReset().mockImplementation(async (request, send) => {
      await send(request.payload);
      return { status: "SENT", providerMessageId: "provider_1", reused: false };
    });
  });

  it("returns the selected contact's ordered conversation", async () => {
    mocks.getRepository.mockReturnValue({
      getContactById: vi.fn().mockResolvedValue(contact),
      listOutboundDeliveriesForRecipientPage: vi.fn().mockResolvedValue({ records: [] }),
      listInboundEventsForRecipient: vi.fn().mockResolvedValue({ records: [inbound] }),
    });

    const response = await GET(new Request("http://localhost/api/inbox/contact_1"), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.messages).toEqual([expect.objectContaining({ direction: "inbound", text: "Hello" })]);
  });

  it("sends and persists a manual reply inside the messaging window", async () => {
    const repository = {
      getContactById: vi.fn().mockResolvedValue(contact),
      listInboundEventsForRecipient: vi.fn().mockResolvedValue({ records: [inbound] }),
      listConnections: vi.fn().mockResolvedValue([{ igUserId: "ig_1", status: "CONNECTED", accessTokenEncrypted: "sealed" }]),
      pauseContactAutomations: vi.fn().mockResolvedValue(true),
    };
    mocks.getRepository.mockReturnValue(repository);

    const response = await POST(new Request("http://localhost/api/inbox/contact_1", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "reply_1" },
      body: JSON.stringify({ text: "Hi there" }),
    }), context());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.message).toMatchObject({ direction: "outbound", text: "Hi there", status: "sent" });
    // A teammate took over the conversation, so automations step back.
    expect(repository.pauseContactAutomations).toHaveBeenCalledWith(
      "workspace_1", "ig_1", "person_1", body.data.automationsPausedUntil, "manual_reply",
    );
    expect(Date.parse(body.data.automationsPausedUntil)).toBeGreaterThan(Date.now());
    expect(mocks.executeOutboundDelivery).toHaveBeenCalledWith(expect.objectContaining({
      deliveryKey: "manual-inbox:workspace_1:contact_1:reply_1",
      kind: "MANUAL_INBOX",
      recipientId: "person_1",
      instagramAccountId: "ig_1",
      payload: { type: "text", text: "Hi there" },
    }), expect.any(Function));
  });

  it("rejects a manual reply when no recent inbound message opened the window", async () => {
    mocks.getRepository.mockReturnValue({
      getContactById: vi.fn().mockResolvedValue(contact),
      listConnections: vi.fn().mockResolvedValue([]),
      listInboundEventsForRecipient: vi.fn().mockResolvedValue({ records: [] }),
    });

    const response = await POST(new Request("http://localhost/api/inbox/contact_1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Too late" }),
    }), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("24-hour") });
  });

  it("updates one inbox state operation", async () => {
    const updateInboxState = vi.fn().mockResolvedValue({ ...contact, inboxFavorite: true });
    mocks.getRepository.mockReturnValue({ getContactById: vi.fn().mockResolvedValue(contact), updateInboxState });

    const response = await PATCH(new Request("http://localhost/api/inbox/contact_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "set_favorite", favorite: true }),
    }), context());

    expect(response.status).toBe(200);
    expect(updateInboxState).toHaveBeenCalledWith("workspace_1", "contact_1", { action: "set_favorite", favorite: true });
  });

  function replyRepository(overrides: Record<string, unknown> = {}) {
    return {
      getContactById: vi.fn().mockResolvedValue({ ...contact, inboxStatus: "CLOSED" }),
      listInboundEventsForRecipient: vi.fn().mockResolvedValue({ records: [inbound] }),
      listConnections: vi.fn().mockResolvedValue([{ igUserId: "ig_1", status: "CONNECTED", accessTokenEncrypted: "sealed" }]),
      pauseContactAutomations: vi.fn().mockResolvedValue(true),
      updateInboxState: vi.fn().mockResolvedValue({ ...contact, inboxStatus: "OPEN" }),
      ...overrides,
    };
  }

  function reply() {
    return POST(new Request("http://localhost/api/inbox/contact_1", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "reply_2" },
      body: JSON.stringify({ text: "Hi there" }),
    }), context());
  }

  it("returns the OutboundDelivery id (the id GET uses) and reopens a closed conversation", async () => {
    const repository = replyRepository();
    mocks.getRepository.mockReturnValue(repository);
    mocks.executeOutboundDelivery.mockResolvedValue({ status: "SENT", providerMessageId: "mid_1", reused: false, deliveryId: "delivery_abc" });

    const response = await reply();
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.message.id).toBe("delivery_abc");
    expect(body.data.inboxStatus).toBe("OPEN");
    expect(repository.updateInboxState).toHaveBeenCalledWith("workspace_1", "contact_1", { action: "set_status", status: "OPEN" });
  });

  it("answers an exhausted monthly delivery allowance with the entitlement contract", async () => {
    mocks.getRepository.mockReturnValue(replyRepository());
    mocks.executeOutboundDelivery.mockResolvedValue({
      status: "FAILED", retryable: false, error: "Monthly delivery limit reached", reason: "QUOTA_REJECTED",
    });

    const response = await reply();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "limit_reached", capability: "deliveries" });
  });

  it("never returns the provider's raw error text", async () => {
    mocks.getRepository.mockReturnValue(replyRepository());
    mocks.executeOutboundDelivery.mockResolvedValue({
      status: "FAILED", retryable: false, error: "(#100) Invalid OAuth access token - token EAAB...xyz",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await reply();
    const body = await response.json() as { error: string };

    expect(response.status).toBe(502);
    expect(body.error).not.toContain("OAuth");
    expect(body.error).not.toContain("EAAB");
    warn.mockRestore();
  });
});

describe("GET /api/inbox/[contactId] paging", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ workspaceId: "workspace_1", userId: "user_1" });
  });

  async function memoryConversation() {
    const { createMemoryRepository } = await import("@/src/lib/memory-repository");
    const repository = createMemoryRepository();
    const touched = await repository.touchContact("workspace_1", "ig_1", "person_1", "2026-09-04T09:00:00.000Z");
    mocks.getRepository.mockReturnValue(repository);
    return { repository, contactId: touched.record.id };
  }

  async function page(contactId: string, cursor?: string, limit = 1) {
    const query = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) });
    const response = await GET(
      new Request(`http://localhost/api/inbox/${contactId}?${query}`),
      { params: Promise.resolve({ contactId }) },
    );
    expect(response.status).toBe(200);
    return (await response.json()).data as { messages: { id: string; text: string }[]; nextCursor?: string };
  }

  async function collect(contactId: string, limit: number) {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 20; guard += 1) {
      const result = await page(contactId, cursor, limit);
      seen.push(...result.messages.map((message) => message.text));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    return seen;
  }

  it("does not repeat an inbound message that shares a millisecond with a delivery", async () => {
    const { repository, contactId } = await memoryConversation();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-04T10:00:00.000Z"));
      await repository.ensureOutboundDelivery({
        deliveryKey: "k1", workspaceId: "workspace_1", instagramAccountId: "ig_1", recipientId: "person_1",
        kind: "MANUAL_INBOX", payload: { type: "text", text: "outbound" },
      });
    } finally {
      vi.useRealTimers();
    }
    await repository.recordWebhookEvent("workspace_1", {
      providerEventId: "m1", eventType: "message.received", receivedAt: "2026-09-04T10:00:00.000Z",
      payload: { accountId: "ig_1", recipientId: "person_1", text: "inbound" },
    });
    await repository.recordWebhookEvent("workspace_1", {
      providerEventId: "m0", eventType: "message.received", receivedAt: "2026-09-04T09:30:00.000Z",
      payload: { accountId: "ig_1", recipientId: "person_1", text: "earlier" },
    });

    const texts = await collect(contactId, 1);

    expect(texts).toEqual(["inbound", "outbound", "earlier"]);
  });

  it("keeps paging when every fetched row of a page is dropped", async () => {
    const { repository, contactId } = await memoryConversation();
    vi.useFakeTimers();
    try {
      // Five deliveries without text (e.g. media) are not chat bubbles.
      for (let minute = 0; minute < 5; minute += 1) {
        vi.setSystemTime(new Date(Date.UTC(2026, 8, 4, 10, 10 - minute)));
        await repository.ensureOutboundDelivery({
          deliveryKey: `media_${minute}`, workspaceId: "workspace_1", instagramAccountId: "ig_1", recipientId: "person_1",
          kind: "CLASSIC_ACTION", payload: { type: "image" },
        });
      }
    } finally {
      vi.useRealTimers();
    }
    await repository.recordWebhookEvent("workspace_1", {
      providerEventId: "old", eventType: "message.received", receivedAt: "2026-09-04T09:00:00.000Z",
      payload: { accountId: "ig_1", recipientId: "person_1", text: "the first message" },
    });

    const texts = await collect(contactId, 2);

    expect(texts).toEqual(["the first message"]);
  });
});
