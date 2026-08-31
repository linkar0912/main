import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getMemberRole: vi.fn(),
  listMembers: vi.fn(),
  listInvitations: vi.fn(),
  createInvitation: vi.fn(),
  assertEntitled: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({
  getMemberRole: mocks.getMemberRole,
  listMembers: mocks.listMembers,
  listInvitations: mocks.listInvitations,
  createInvitation: mocks.createInvitation,
}) }));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
}));
vi.mock("@/src/lib/mailer", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ appUrl: "https://app.linkar.in" }) }));

const { POST } = await import("./route");

describe("POST /api/team/invitations", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "u1", email: "owner@linkar.in", workspaceId: "w1" });
    mocks.getMemberRole.mockReset().mockResolvedValue("OWNER");
    mocks.listMembers.mockReset().mockResolvedValue([{ email: "owner@linkar.in", role: "OWNER" }]);
    mocks.listInvitations.mockReset().mockResolvedValue([]);
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
    mocks.createInvitation.mockReset();
    mocks.sendEmail.mockReset();
  });

  it("returns the literal member-limit contract before creating or emailing", async () => {
    const { EntitlementError } = await import("@/src/lib/entitlements/service");
    mocks.assertEntitled.mockRejectedValue(new EntitlementError("limit_reached", "members", 2, 2));

    const response = await POST(new Request("https://app.linkar.in/api/team/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "member@example.com", role: "MEMBER" }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "limit_reached", capability: "members", used: 2, limit: 2 });
    expect(mocks.createInvitation).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
