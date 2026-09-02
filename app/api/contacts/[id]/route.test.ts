import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({ getValidatedSession: vi.fn() }));
vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));

let repository = createMemoryRepository();
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => repository }));

const { GET } = await import("./route");

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
