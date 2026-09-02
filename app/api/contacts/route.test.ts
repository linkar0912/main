import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import { sealSecret } from "@/src/lib/security/secrets";

const mocks = vi.hoisted(() => ({ getValidatedSession: vi.fn() }));
vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));

let repository = createMemoryRepository();
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => repository }));

const { GET, POST } = await import("./route");

describe("GET /api/contacts", () => {
  beforeEach(async () => {
    repository = createMemoryRepository();
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    const first = await repository.touchContact("workspace_1", "ig_1", "person_1", "2026-09-01T06:00:00.000Z");
    await repository.captureContactEmail("workspace_1", "ig_1", "person_1", "one@example.com", "2026-09-01T06:01:00.000Z");
    await repository.touchContact("workspace_2", "ig_2", "foreign", "2026-09-01T06:02:00.000Z");
    await repository.updateContactProfile("workspace_1", first.record.id, { leadStatus: "QUALIFIED" });
  });

  afterEach(() => {
    delete process.env.META_TOKEN_ENCRYPTION_KEY;
    vi.unstubAllGlobals();
  });

  it("preserves the legacy captured-email response by default", async () => {
    const response = await GET(new Request("https://app.linkar.in/api/contacts"));
    const body = await response.json();

    expect(body.data.count).toBe(1);
    expect(body.data.contacts).toEqual([expect.objectContaining({ email: "one@example.com" })]);
    expect(body.data.counts).toBeUndefined();
  });

  it("lists full workspace contacts with lead-stage counts", async () => {
    const response = await GET(new Request("https://app.linkar.in/api/contacts?scope=all"));
    const body = await response.json();

    expect(body.data.count).toBe(1);
    expect(body.data.counts).toEqual({ NEW: 0, ENGAGED: 0, QUALIFIED: 1, CUSTOMER: 0 });
    expect(body.data.contacts).toEqual([
      expect.objectContaining({ email: "one@example.com", leadStatus: "QUALIFIED", igScopedUserId: "person_1" }),
    ]);
  });

  it("returns the Instagram handle instead of exposing a scoped user id as the contact name", async () => {
    const key = randomBytes(32).toString("hex");
    process.env.META_TOKEN_ENCRYPTION_KEY = key;
    await repository.upsertConnection({
      workspaceId: "workspace_1",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ username: "probablymansi" }), { status: 200 }),
    ));

    const response = await GET(new Request("https://app.linkar.in/api/contacts?scope=all"));
    const body = await response.json();

    expect(body.data.contacts[0]).toMatchObject({ instagramUsername: "probablymansi" });
  });

  it("filters full contacts by a valid lead status and rejects an invalid one", async () => {
    const filtered = await GET(new Request("https://app.linkar.in/api/contacts?scope=all&leadStatus=NEW"));
    expect((await filtered.json()).data.contacts).toEqual([]);

    const invalid = await GET(new Request("https://app.linkar.in/api/contacts?scope=all&leadStatus=UNKNOWN"));
    expect(invalid.status).toBe(400);
  });

  it("reconciles existing campaign participants and recent inbox senders into contacts", async () => {
    await repository.createParticipant({
      workspaceId: "workspace_1",
      automationId: "automation_1",
      instagramAccountId: "ig_1",
      igScopedUserId: "campaign_person",
      sourceCommentId: "comment_1",
      sourceMediaId: "media_1",
      sourceMediaSnapshot: {
        id: "media_1",
        mediaType: "VIDEO",
        permalink: "https://www.instagram.com/reel/media_1/",
        timestamp: "2026-09-01T08:00:00.000Z",
      },
    });
    await repository.recordWebhookEvent("workspace_1", {
      providerEventId: "message_1",
      eventType: "message.received",
      receivedAt: "2026-09-01T09:00:00.000Z",
      payload: { accountId: "ig_1", recipientId: "inbox_person" },
    });

    const response = await POST(new Request("https://app.linkar.in/api/contacts", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { reconciled: 2 } });
    expect(await repository.getContact("workspace_1", "ig_1", "campaign_person")).toBeTruthy();
    expect(await repository.getContact("workspace_1", "ig_1", "inbox_person")).toBeTruthy();
  });

  it("preserves the earliest and latest event dates while reconciling one contact", async () => {
    await repository.recordWebhookEvent("workspace_1", {
      providerEventId: "message_old",
      eventType: "message.received",
      receivedAt: "2026-08-29T08:00:00.000Z",
      payload: { accountId: "ig_1", recipientId: "returning_person" },
    });
    await repository.recordWebhookEvent("workspace_1", {
      providerEventId: "message_new",
      eventType: "message.received",
      receivedAt: "2026-09-02T08:00:00.000Z",
      payload: { accountId: "ig_1", recipientId: "returning_person" },
    });

    await POST(new Request("https://app.linkar.in/api/contacts", { method: "POST" }));

    expect(await repository.getContact("workspace_1", "ig_1", "returning_person")).toMatchObject({
      createdAt: "2026-08-29T08:00:00.000Z",
      lastSeenAt: "2026-09-02T08:00:00.000Z",
    });
  });
});
