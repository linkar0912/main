import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), update: vi.fn(), upsert: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ platformOwnerUserIds: ["owner"] }) }));
vi.mock("@/src/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ auth: { admin: { getUserById: mocks.lookup, updateUserById: mocks.update } } }) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { platformUserControl: { upsert: mocks.upsert } } }));
const { setAdminUserAccess } = await import("./user-service");
beforeEach(() => { vi.clearAllMocks(); mocks.update.mockResolvedValue({ error: null }); mocks.upsert.mockResolvedValue({}); });
describe("admin user access", () => {
  it("unbans both Auth login and Linkar access without erasing the revoked-session cutoff", async () => {
    await setAdminUserAccess("user", { action: "UNBAN", reason: "Review complete", actorUserId: "owner" });
    expect(mocks.update).toHaveBeenCalledWith("user", { ban_duration: "none" });
    const { update } = mocks.upsert.mock.calls[0][0];
    expect(update).toEqual({ status: "ACTIVE", suspendedAt: null, suspendedReason: null, suspendedByUserId: null });
  });
  it("bans and invalidates previous Linkar sessions", async () => {
    await setAdminUserAccess("user", { action: "BAN", reason: "Abuse", actorUserId: "owner" });
    expect(mocks.upsert.mock.calls[0][0].update).toMatchObject({ status: "SUSPENDED", sessionInvalidBefore: expect.any(Date) });
  });
  it("does not restore Linkar access if Auth unban fails", async () => {
    mocks.update.mockResolvedValue({ error: { status: 500 } });
    await expect(setAdminUserAccess("user", { action: "UNBAN", reason: "Review", actorUserId: "owner" })).rejects.toThrow("user_unban_failed");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("protects platform owners", async () => {
    await expect(setAdminUserAccess("OWNER", { action: "BAN", reason: "Test", actorUserId: "owner" })).rejects.toThrow("platform_owner_protected");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

it("does not create an access-control record for an absent Auth identity", async () => {
  mocks.lookup.mockResolvedValue({ data: { user: null }, error: { status: 404 } });
  await expect(setAdminUserAccess("absent", { action: "SUSPEND", reason: "Review", actorUserId: "owner" })).rejects.toMatchObject({ code: "user_not_found" });
  expect(mocks.upsert).not.toHaveBeenCalled();
});
