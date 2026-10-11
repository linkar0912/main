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

    const response = await GET(new Request("https://app.linkar.in/api/contacts?scope=all&enrich=1"));
    const body = await response.json();

    expect(body.data.contacts[0]).toMatchObject({ instagramUsername: "probablymansi" });
  });

  it("pages through contacts with an offset and says when more remain", async () => {
    await repository.touchContact("workspace_1", "ig_1", "person_2", "2026-09-01T07:00:00.000Z");
    await repository.touchContact("workspace_1", "ig_1", "person_3", "2026-09-01T08:00:00.000Z");

    const first = await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&limit=2"))).json();
    expect(first.data.contacts.map((c: { igScopedUserId: string }) => c.igScopedUserId)).toEqual(["person_3", "person_2"]);
    expect(first.data.hasMore).toBe(true);

    const second = await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&limit=2&offset=2"))).json();
    expect(second.data.contacts.map((c: { igScopedUserId: string }) => c.igScopedUserId)).toEqual(["person_1"]);
    expect(second.data.hasMore).toBe(false);
  });

  it("pages with a stable cursor even when a contact is touched between pages", async () => {
    await repository.touchContact("workspace_1", "ig_1", "person_2", "2026-09-01T07:00:00.000Z");
    await repository.touchContact("workspace_1", "ig_1", "person_3", "2026-09-01T08:00:00.000Z");

    const first = await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&limit=2"))).json();
    expect(first.data.nextCursor).toEqual(expect.any(String));
    // A new person messages: with offset=2 the list would shift and person_2
    // would be shown twice. The cursor resumes right after person_2.
    await repository.touchContact("workspace_1", "ig_1", "person_4", "2026-09-01T09:00:00.000Z");
    const shifted = await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&limit=2&offset=2"))).json();
    expect(shifted.data.contacts.map((c: { igScopedUserId: string }) => c.igScopedUserId)).toEqual(["person_2", "person_1"]);

    const second = await (await GET(new Request(`https://app.linkar.in/api/contacts?scope=all&limit=2&cursor=${first.data.nextCursor}`))).json();
    expect(second.data.contacts.map((c: { igScopedUserId: string }) => c.igScopedUserId)).toEqual(["person_1"]);
    expect(second.data.hasMore).toBe(false);
    expect(second.data.nextCursor).toBeUndefined();

    const invalid = await GET(new Request("https://app.linkar.in/api/contacts?scope=all&cursor=nope"));
    expect(invalid.status).toBe(400);
  });

  describe("server-side search (?q=)", () => {
    beforeEach(async () => {
      await repository.touchContact("workspace_1", "ig_1", "person_meera", "2026-09-01T07:00:00.000Z");
      await repository.rememberContactUsernames("workspace_1", [{ instagramAccountId: "ig_1", igScopedUserId: "person_meera", username: "Meera.Styles" }]);
      await repository.touchContact("workspace_1", "ig_1", "person_tagged", "2026-09-01T07:30:00.000Z");
      await repository.setContactTags("workspace_1", "ig_1", "person_tagged", ["repeat_vip"]);
      await repository.rememberContactUsernames("workspace_2", [{ instagramAccountId: "ig_2", igScopedUserId: "foreign", username: "meera.elsewhere" }]);
    });

    const handles = (body: { data: { contacts: Array<{ igScopedUserId: string }> } }) => body.data.contacts.map((c) => c.igScopedUserId);

    it("matches the handle, email and tags case-insensitively, scoped to the workspace", async () => {
      const byHandle = await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&q=MEERA"))).json();
      expect(handles(byHandle)).toEqual(["person_meera"]);
      expect(byHandle.data.query).toBe("MEERA");
      // A leading @ is how people type handles.
      expect(handles(await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&q=%40meera.st"))).json())).toEqual(["person_meera"]);
      expect(handles(await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&q=ONE%40EXAMPLE"))).json())).toEqual(["person_1"]);
      expect(handles(await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&q=vip"))).json())).toEqual(["person_tagged"]);
      expect(handles(await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&q=nobody"))).json())).toEqual([]);
    });

    it("treats % and _ as plain characters, not wildcards", async () => {
      expect(handles(await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&q=%25"))).json())).toEqual([]);
      // "_" is a single-character wildcard in LIKE; it must only match a real underscore.
      expect(handles(await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&q=t_vip"))).json())).toEqual(["person_tagged"]);
      expect(handles(await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&q=e_s"))).json())).toEqual([]);
    });

    it("counts stages for the search, combines with the stage filter and pages with the cursor", async () => {
      await repository.updateContactProfile("workspace_1", (await repository.getContact("workspace_1", "ig_1", "person_meera"))!.id, { leadStatus: "CUSTOMER" });
      const body = await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&q=e"))).json();
      // person_1 (one@example.com), person_meera and person_tagged (repeat_vip) all contain "e".
      expect(body.data.counts).toEqual({ NEW: 1, ENGAGED: 0, QUALIFIED: 1, CUSTOMER: 1 });
      expect(body.data.count).toBe(3);
      const customers = await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&q=e&leadStatus=CUSTOMER"))).json();
      expect(handles(customers)).toEqual(["person_meera"]);

      const first = await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&q=e&limit=2"))).json();
      expect(handles(first)).toEqual(["person_tagged", "person_meera"]);
      const second = await (await GET(new Request(`https://app.linkar.in/api/contacts?scope=all&q=e&limit=2&cursor=${first.data.nextCursor}`))).json();
      expect(handles(second)).toEqual(["person_1"]);
    });

    it("finds contacts owned by a member whose email matches", async () => {
      await repository.addMember("workspace_1", "riya.ops@example.com", "MEMBER", "user_riya");
      const tagged = await repository.getContact("workspace_1", "ig_1", "person_tagged");
      await repository.updateContactProfile("workspace_1", tagged!.id, { assigneeUserId: "user_riya" });
      expect(handles(await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&q=riya"))).json())).toEqual(["person_tagged"]);
    });

    // The palette used to load the newest 200 contacts once and filter them
    // in the browser, so anyone older was never found. The server search
    // reaches every contact, however old.
    it("finds a contact older than the newest 200", async () => {
      for (let index = 0; index < 205; index += 1) {
        await repository.touchContact("workspace_1", "ig_1", `recent_${index}`, new Date(Date.UTC(2026, 8, 5, 0, index)).toISOString());
      }
      const newest = await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&limit=200"))).json();
      expect(handles(newest)).not.toContain("person_meera");
      const found = await (await GET(new Request("https://app.linkar.in/api/contacts?scope=all&limit=5&q=meera"))).json();
      expect(handles(found)).toEqual(["person_meera"]);
    });
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
