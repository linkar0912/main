import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({ getValidatedSession: vi.fn() }));
vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));

let repository = createMemoryRepository();
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => repository }));

const { GET, PATCH } = await import("./route");

describe("GET /api/contacts/[id]", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
  });

  it("returns the resolved Instagram username used by the Inbox row", async () => {
    const touched = await repository.touchContact(
      "workspace_1",
      "ig_1",
      "person_1",
      "2026-09-02T08:07:00.000Z",
    );
    await repository.recordWebhookEvent("workspace_1", {
      providerEventId: "message_1",
      eventType: "message.received",
      receivedAt: "2026-09-02T08:07:00.000Z",
      payload: {
        accountId: "ig_1",
        recipientId: "person_1",
        senderUsername: "tejastelkar9",
      },
    });

    const response = await GET(
      new Request(`https://app.linkar.in/api/contacts/${touched.record.id}`),
      { params: Promise.resolve({ id: touched.record.id }) },
    );
    const body = await response.json();

    expect(body.data.contact.instagramUsername).toBe("tejastelkar9");
  });
});

describe("PATCH /api/contacts/[id] sourceAutomationId", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
  });

  function patch(id: string, body: unknown) {
    return PATCH(new Request(`https://app.linkar.in/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }), { params: Promise.resolve({ id }) });
  }

  it("refuses an automation id that does not belong to the workspace", async () => {
    const contact = (await repository.touchContact("workspace_1", "ig_1", "person_1", "2026-09-02T08:07:00.000Z")).record;
    const foreign = await repository.createAutomation("workspace_2", {
      name: "Other",
      definition: { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [{ type: "send_text", text: "Hi" }] },
    });

    const response = await patch(contact.id, { sourceAutomationId: foreign.id });

    expect(response.status).toBe(400);
    expect((await repository.getContactById("workspace_1", contact.id))?.sourceAutomationId).toBeUndefined();
  });

  it("accepts one of the workspace's own automations", async () => {
    const contact = (await repository.touchContact("workspace_1", "ig_1", "person_1", "2026-09-02T08:07:00.000Z")).record;
    const own = await repository.createAutomation("workspace_1", {
      name: "Mine",
      definition: { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [{ type: "send_text", text: "Hi" }] },
    });

    const response = await patch(contact.id, { sourceAutomationId: own.id });

    expect(response.status).toBe(200);
    expect((await response.json()).data.sourceAutomationId).toBe(own.id);
  });
});
