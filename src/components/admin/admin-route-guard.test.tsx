import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), identity: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/src/lib/admin/authorization", async original => ({ ...await original<typeof import("@/src/lib/admin/authorization")>(), getPlatformOwnerSession: mocks.session, getPlatformOwnerIdentity: mocks.identity }));
const { AdminRouteGuard } = await import("./admin-route-guard");
const { PlatformOwnerAuthError } = await import("@/src/lib/admin/authorization");
beforeEach(() => vi.clearAllMocks());
it("sends an owner without AAL2 to MFA enrollment", async () => {
  mocks.session.mockRejectedValue(new PlatformOwnerAuthError(428, "mfa_required"));
  await expect(AdminRouteGuard({ children: null })).rejects.toThrow("redirect:/admin/security");
});
it("does not disguise an infrastructure outage as an authentication rejection", async () => {
  mocks.session.mockRejectedValue(new Error("database unavailable"));
  await expect(AdminRouteGuard({ children: null })).rejects.toThrow("database unavailable");
  expect(mocks.redirect).not.toHaveBeenCalled();
});
