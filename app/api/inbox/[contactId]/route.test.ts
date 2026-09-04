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
});
