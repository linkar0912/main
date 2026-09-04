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
      avatarUrl: "/api/facebook/avatar?pageId=page_1&profileId=person_1",
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
      avatarUrl: `/api/contacts/${contact.record.id}/avatar`,
      summary: "Can a person help me?",
    });
  });

  it("uses the persisted event handle without requesting a live profile", async () => {
    await repository.recordWebhookEvent("workspace_1", {
      providerEventId: "instagram_message_with_name",
      eventType: "message.received",
      receivedAt: "2026-08-30T06:01:00.000Z",
      payload: { accountId: "ig_account_1", recipientId: "person_1", senderUsername: "probablymansi", text: "Hello" },
    });
    const externalFetch = vi.fn();
    vi.stubGlobal("fetch", externalFetch);

    const response = await GET(new Request("http://localhost/api/activity"));
    const body = await response.json();

    expect(body.data[0].from).toBe("@probablymansi");
    expect(externalFetch).not.toHaveBeenCalled();
  });

  it("does not wait on Meta profile requests while loading the inbox", async () => {
    const key = randomBytes(32).toString("hex");
    process.env.META_TOKEN_ENCRYPTION_KEY = key;
    await repository.upsertConnection({
      workspaceId: "workspace_1",
      igUserId: "ig_account_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
    await repository.touchContact("workspace_1", "ig_account_1", "person_1", "2026-08-30T06:00:00.000Z");
    await repository.recordWebhookEvent("workspace_1", {
      providerEventId: "instagram_fast_inbox",
      eventType: "message.received",
      receivedAt: "2026-08-30T06:01:00.000Z",
      payload: { accountId: "ig_account_1", recipientId: "person_1", text: "Hello" },
    });
    const externalFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ username: "slow-profile" })));
    vi.stubGlobal("fetch", externalFetch);

    const response = await GET(new Request("http://localhost/api/activity"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0]).toMatchObject({ contactId: expect.any(String), from: "IG user ·rson_1" });
    expect(externalFetch).not.toHaveBeenCalled();
  });
});
