import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({ getValidatedSession: vi.fn() }));

vi.mock("@/src/lib/auth/session", () => ({
  getValidatedSession: mocks.getValidatedSession,
}));

let repository = createMemoryRepository();

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => repository,
}));

const { GET } = await import("./route");

describe("GET /api/activity", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
  });

  it("maps Facebook Page comment activity with the comment author", async () => {
    await repository.recordWebhookEvent("workspace_1", {
      providerEventId: "facebook_event_1",
      eventType: "facebook.comment.created",
      receivedAt: "2026-08-30T06:00:00.000Z",
      payload: {
        pageId: "page_1",
        senderId: "person_1",
        senderName: "Taylor",
        text: "Interested",
      },
    });

    const response = await GET(new Request("http://localhost/api/activity"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      channel: "facebook",
      type: "facebook.comment.created",
      label: "Facebook Page comment",
      account: "page_1",
      from: "Taylor",
      summary: "Interested",
    });
  });

  it("links Instagram inbox activity to the matching contact", async () => {
    const contact = await repository.touchContact(
      "workspace_1",
      "ig_account_1",
      "person_1",
      "2026-08-30T06:00:00.000Z",
    );
    await repository.recordWebhookEvent("workspace_1", {
      providerEventId: "instagram_event_1",
      eventType: "message.received",
      receivedAt: "2026-08-30T06:01:00.000Z",
      payload: {
        accountId: "ig_account_1",
        recipientId: "person_1",
        senderUsername: "taylor",
        text: "Can a person help me?",
      },
    });

    const response = await GET(new Request("http://localhost/api/activity"));
    const body = await response.json();

    expect(body.data[0]).toMatchObject({
      channel: "instagram",
      contactId: contact.record.id,
      from: "@taylor",
      summary: "Can a person help me?",
    });
  });
});
