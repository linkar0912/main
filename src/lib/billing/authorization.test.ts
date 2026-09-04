import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  role: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.session }));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ getMemberRole: mocks.role }),
}));

const { requireBillingOwner, requireBillingReader } = await import("./authorization");
const request = new Request("https://app.linkar.in/api/billing");

describe("billing authorization", () => {
  beforeEach(() => {
    mocks.session.mockReset().mockResolvedValue({ userId: "user_1", email: "owner@linkar.in", workspaceId: "ws_1" });
    mocks.role.mockReset().mockResolvedValue("OWNER");
  });

  it("rejects unauthenticated readers", async () => {
    mocks.session.mockResolvedValue(null);

    const result = await requireBillingReader(request);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(401);
  });

  it("allows a workspace member to read billing state", async () => {
    mocks.role.mockResolvedValue("MEMBER");

    const result = await requireBillingReader(request);

    expect(result).toMatchObject({ ok: true, role: "MEMBER", session: { workspaceId: "ws_1" } });
  });

  it("allows only the workspace owner to mutate billing", async () => {
    expect(await requireBillingOwner(request)).toMatchObject({ ok: true, role: "OWNER" });

    mocks.role.mockResolvedValue("ADMIN");
    const admin = await requireBillingOwner(request);
    expect(admin.ok).toBe(false);
    if (!admin.ok) expect(admin.error.status).toBe(403);

    mocks.role.mockResolvedValue("MEMBER");
    const member = await requireBillingOwner(request);
    expect(member.ok).toBe(false);
    if (!member.ok) expect(member.error.status).toBe(403);
  });
});
