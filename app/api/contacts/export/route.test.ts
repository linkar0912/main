import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  listContactsByLeadStatus: vi.fn(),
  assertEntitled: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({ listContactsByLeadStatus: mocks.listContactsByLeadStatus }) }));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
}));

const { GET } = await import("./route");

describe("GET /api/contacts/export", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "u1", workspaceId: "w1" });
    mocks.listContactsByLeadStatus.mockReset();
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
  });

  it("returns the literal export-feature contract before loading contacts", async () => {
    const { EntitlementError } = await import("@/src/lib/entitlements/service");
    mocks.assertEntitled.mockRejectedValue(new EntitlementError("entitlement_required", "exports"));

    const response = await GET(new Request("https://app.linkar.in/api/contacts/export"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "entitlement_required", capability: "exports" });
    expect(mocks.listContactsByLeadStatus).not.toHaveBeenCalled();
  });

  it("exports the complete CRM contact set, including contacts without email", async () => {
    mocks.listContactsByLeadStatus.mockResolvedValue([{
      id: "contact_1",
      email: undefined,
      instagramAccountId: "ig_1",
      igScopedUserId: "person_1",
      leadStatus: "ENGAGED",
      score: 4,
      tags: ["commenter", "priority"],
      assigneeUserId: "owner@example.com",
      suppressedAt: undefined,
      lastSeenAt: "2026-09-01T10:00:00.000Z",
      createdAt: "2026-08-31T10:00:00.000Z",
    }]);

    const response = await GET(new Request("https://app.linkar.in/api/contacts/export"));
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(mocks.listContactsByLeadStatus).toHaveBeenCalledWith("w1", { limit: 10_000 });
    expect(csv).toContain("contact_id,email,instagram_account_id,instagram_user_id,lead_status,score,tags,assignee,opted_out,last_seen_at,created_at");
    expect(csv).toContain("contact_1,,ig_1,person_1,ENGAGED,4,commenter;priority,owner@example.com,false");
  });
});
