import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  role: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.session }));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ getMemberRole: mocks.role }),
}));

const { requireManager, requireRole } = await import("./require-role");
const request = new Request("https://app.linkar.in/api/anything");

describe("requireRole", () => {
  beforeEach(() => {
    mocks.session.mockReset().mockResolvedValue({ userId: "user_1", email: "owner@linkar.in", workspaceId: "ws_1" });
    mocks.role.mockReset().mockResolvedValue("OWNER");
  });

  it("rejects a missing session with 401", async () => {
    mocks.session.mockResolvedValue(null);
    const result = await requireManager(request);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(401);
  });

  it("lets owners and admins through", async () => {
    expect(await requireManager(request)).toMatchObject({ ok: true, role: "OWNER" });
    mocks.role.mockResolvedValue("ADMIN");
    expect(await requireManager(request)).toMatchObject({ ok: true, role: "ADMIN", session: { workspaceId: "ws_1" } });
    expect(mocks.role).toHaveBeenCalledWith("ws_1", "owner@linkar.in");
  });

  it("returns 403 forbidden for members and for a missing member row", async () => {
    for (const role of ["MEMBER", null]) {
      mocks.role.mockResolvedValue(role);
      const result = await requireManager(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(403);
        expect(await result.error.json()).toEqual({ error: "forbidden" });
      }
    }
  });

  it("honours a custom allow-list", async () => {
    mocks.role.mockResolvedValue("ADMIN");
    const result = await requireRole(request, ["OWNER"]);
    expect(result.ok).toBe(false);
  });
});
