import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), list: vi.fn(), create: vi.fn(), audited: vi.fn() }));
vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminRead: mocks.read, requireAdminWrite: mocks.write }));
vi.mock("@/src/lib/admin/http", () => ({
  adminJson: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  adminRouteError: () => Response.json({ error: "failed" }, { status: 500 }),
  runAuditedAdminMutation: (_guard: unknown, work: () => unknown) => work(),
}));
vi.mock("@/src/lib/billing/premium-invite", () => ({ getPremiumInviteService: () => ({ list: mocks.list, create: mocks.create }) }));
import { GET, POST } from "./route";

describe("admin invite codes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue({ userId: "admin_1" });
    mocks.write.mockResolvedValue({ owner: { userId: "admin_1" } });
    mocks.list.mockResolvedValue([]);
    mocks.create.mockResolvedValue({ id: "invite_1", code: "LINKAR-ABCD-EFGH-IJKL" });
  });

  it("lists codes without exposing stored hashes", async () => {
    const response = await GET(new Request("https://app.linkar.in/api/admin/invite-codes"));
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledOnce();
  });

  it("creates a 30-day Agency code and returns its plaintext once", async () => {
    const response = await POST(new Request("https://app.linkar.in/api/admin/invite-codes", { method: "POST", headers: { "content-type": "application/json", "x-admin-reason": "creator launch" }, body: JSON.stringify({ label: "Creator launch" }) }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ label: "Creator launch", createdByUserId: "admin_1", expiresAt: null });
    await expect(response.json()).resolves.toMatchObject({ data: { code: "LINKAR-ABCD-EFGH-IJKL" } });
  });
});
