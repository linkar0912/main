import { describe, expect, it } from "vitest";
import type { AutomationContactRecord, OutboundDeliveryRecord, WebhookEventRecord } from "./repository";
import { buildConversation, buildInboxContacts } from "./inbox";

const contact: AutomationContactRecord = {
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
  lastSeenAt: "2026-09-03T10:00:00.000Z",
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-09-03T10:00:00.000Z",
};

const inbound: WebhookEventRecord = {
  id: "event_1",
  providerEventId: "message_1",
  eventType: "message.received",
  receivedAt: "2026-09-03T10:00:00.000Z",
  payload: { accountId: "ig_1", recipientId: "person_1", text: "Can you help?" },
};

describe("inbox projections", () => {
  it("keeps every contact visible even when only one has a recent message", () => {
    const untouched = { ...contact, id: "contact_2", igScopedUserId: "person_2", lastSeenAt: "2026-08-15T10:00:00.000Z" };

    const result = buildInboxContacts([untouched, contact], [inbound], new Map([["ig_1:person_1", "aanya"]]), Date.parse("2026-09-03T11:00:00.000Z"));

    expect(result.map((item) => item.id)).toEqual(["contact_1", "contact_2"]);
    expect(result[0]).toMatchObject({ username: "aanya", preview: "Can you help?", canMessage: true });
    expect(result[1]).toMatchObject({ preview: "No messages yet", canMessage: false });
  });

  it("builds an ordered chat from inbound webhooks and persisted outbound deliveries", () => {
    const outbound: OutboundDeliveryRecord = {
      id: "delivery_1",
      deliveryKey: "manual:1",
      workspaceId: "workspace_1",
      kind: "MANUAL_INBOX",
      recipientId: "person_1",
      instagramAccountId: "ig_1",
      payload: { type: "text", text: "Absolutely — what do you need?" },
      state: "SENT",
      retryable: false,
      attemptCount: 1,
      createdAt: "2026-09-03T10:01:00.000Z",
      updatedAt: "2026-09-03T10:01:01.000Z",
      sentAt: "2026-09-03T10:01:01.000Z",
    };

    expect(buildConversation(contact, [outbound], [inbound])).toEqual([
      expect.objectContaining({ id: "event_1", direction: "inbound", text: "Can you help?" }),
      expect.objectContaining({ id: "delivery_1", direction: "outbound", text: "Absolutely — what do you need?", status: "sent" }),
    ]);
  });

  it("does not treat comments as opening the Instagram messaging window", () => {
    const comment = { ...inbound, id: "event_2", eventType: "comment.created", receivedAt: "2026-09-03T10:30:00.000Z" };
    const result = buildInboxContacts([contact], [comment], new Map(), Date.parse("2026-09-03T11:00:00.000Z"));

    expect(result[0]).toMatchObject({ canMessage: false, preview: "No messages yet" });
  });
});
