import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getRepository: vi.fn(),
  resolveInstagramUsernames: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: mocks.getRepository }));
vi.mock("@/src/lib/meta/username-resolver", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/meta/username-resolver")>("@/src/lib/meta/username-resolver");
  return { ...actual, resolveInstagramUsernames: mocks.resolveInstagramUsernames };
});
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ metaApiVersion: "v25.0" }) }));

import { GET } from "./route";

const contact = (id: string, person: string, lastSeenAt: string) => ({
  id,
  workspaceId: "workspace_1",
  instagramAccountId: "ig_1",
  igScopedUserId: person,
  state: "NONE",
  attempts: 0,
  tags: [],
  score: 0,
  leadStatus: "NEW",
  lastSeenAt,
  createdAt: lastSeenAt,
  updatedAt: lastSeenAt,
});

describe("GET /api/inbox", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ workspaceId: "workspace_1", userId: "user_1" });
    mocks.resolveInstagramUsernames.mockReset().mockResolvedValue(new Map([["ig_1:person_1", "aanya"]]));
  });

  it("returns every contact, including contacts without messages", async () => {
    mocks.getRepository.mockReturnValue({
      listContactsByLeadStatus: vi.fn().mockResolvedValue([
        contact("contact_1", "person_1", "2026-09-03T10:00:00.000Z"),
        contact("contact_2", "person_2", "2026-08-01T10:00:00.000Z"),
      ]),
      listRecentWebhookEvents: vi.fn().mockResolvedValue([{
        id: "event_1",
        providerEventId: "message_1",
        eventType: "message.received",
        receivedAt: new Date().toISOString(),
        payload: { accountId: "ig_1", recipientId: "person_1", text: "Hello" },
      }]),
      listConnections: vi.fn().mockResolvedValue([]),
    });

    const response = await GET(new Request("http://localhost/api/inbox"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.contacts).toHaveLength(2);
    expect(body.data.contacts[0]).toMatchObject({ id: "contact_1", username: "aanya", preview: "Hello", canMessage: true });
    expect(body.data.contacts[1]).toMatchObject({ id: "contact_2", preview: "No messages yet", canMessage: false });
  });
});
