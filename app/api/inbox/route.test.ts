import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getRepository: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: mocks.getRepository }));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ metaApiVersion: "v25.0" }) }));

import { GET } from "./route";

describe("GET /api/inbox", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ workspaceId: "workspace_1", userId: "user_1" });
    mocks.getRepository.mockReset();
  });

  it("passes validated filters to the paginated repository", async () => {
    const listInboxContacts = vi.fn().mockResolvedValue({
      rows: [{
        record: {
          id: "contact_1", workspaceId: "workspace_1", instagramAccountId: "ig_1", igScopedUserId: "person_1",
          state: "NONE", attempts: 0, tags: ["guide"], score: 0, leadStatus: "NEW", assigneeUserId: "user_1",
          inboxStatus: "OPEN", inboxFavorite: true, inboxReminderAt: "2026-09-04T10:30:00.000Z",
          lastSeenAt: "2026-09-04T10:00:00.000Z", createdAt: "2026-09-04T10:00:00.000Z", updatedAt: "2026-09-04T10:00:00.000Z",
        },
        preview: "Need the guide",
        latestInboundAt: new Date().toISOString(),
        unread: true,
      }],
      nextCursor: "next-page",
    });
    mocks.getRepository.mockReturnValue({ listInboxContacts, listConnections: vi.fn().mockResolvedValue([]), listMembers: vi.fn().mockResolvedValue([]) });

    const response = await GET(new Request("http://localhost/api/inbox?limit=40&status=open&unread=true&assignment=mine&favorite=true&label=guide&reminder=due&sort=unread&query=guide"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(listInboxContacts).toHaveBeenCalledWith("workspace_1", expect.objectContaining({
      limit: 40, status: "OPEN", unread: true, assignment: "mine", currentUserId: "user_1",
      favorite: true, label: "guide", reminder: "due", sort: "unread", query: "guide",
    }));
    expect(body.data).toMatchObject({ nextCursor: "next-page", contacts: [expect.objectContaining({ id: "contact_1", unread: true, preview: "Need the guide" })] });
  });

  it("rejects invalid filters", async () => {
    mocks.getRepository.mockReturnValue({});
    const response = await GET(new Request("http://localhost/api/inbox?sort=random"));
    expect(response.status).toBe(400);
    expect(mocks.getRepository).not.toHaveBeenCalled();
  });
});
