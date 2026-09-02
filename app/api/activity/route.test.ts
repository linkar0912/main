import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import { sealSecret } from "@/src/lib/security/secrets";

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

  afterEach(() => {
    delete process.env.META_TOKEN_ENCRYPTION_KEY;
    vi.unstubAllGlobals();
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

  it("resolves an Instagram handle for message events that only contain a scoped user id", async () => {
    const key = randomBytes(32).toString("hex");
    process.env.META_TOKEN_ENCRYPTION_KEY = key;
    await repository.upsertConnection({
      workspaceId: "workspace_1",
      igUserId: "ig_account_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
    await repository.recordWebhookEvent("workspace_1", {
      providerEventId: "instagram_message_without_name",
      eventType: "message.received",
      receivedAt: "2026-08-30T06:01:00.000Z",
      payload: { accountId: "ig_account_1", recipientId: "person_1", text: "Hello" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ username: "probablymansi" }), { status: 200 }),
    ));

    const response = await GET(new Request("http://localhost/api/activity"));
    const body = await response.json();

    expect(body.data[0].from).toBe("@probablymansi");
  });
});
