import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), update: vi.fn(), upsert: vi.fn(), transaction: vi.fn(), findWorkspace: vi.fn(), findMember: vi.fn(), createMember: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ platformOwnerUserIds: ["owner"] }) }));
vi.mock("@/src/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ auth: { admin: { getUserById: mocks.lookup, updateUserById: mocks.update } } }) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { platformUserControl: { upsert: mocks.upsert }, $transaction: mocks.transaction } }));
const { changeAdminUserMembership, setAdminUserAccess } = await import("./user-service");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
  mocks.upsert.mockResolvedValue({});
  mocks.lookup.mockResolvedValue({ data: { user: { id: "user", email: "user@acme.test" } }, error: null });
  mocks.transaction.mockImplementation((work: (tx: unknown) => unknown) => work({
    workspace: { findUnique: mocks.findWorkspace },
    workspaceMember: { findFirst: mocks.findMember, create: mocks.createMember },
  }));
});
describe("admin user access", () => {
  it("unbans Auth login without touching a separately recorded Linkar suspension", async () => {
    await setAdminUserAccess("user", { action: "UNBAN", reason: "Review complete", actorUserId: "owner" });
    expect(mocks.update).toHaveBeenCalledWith("user", { ban_duration: "none" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("bans Auth login and invalidates previous Linkar sessions without changing Linkar status", async () => {
    await setAdminUserAccess("user", { action: "BAN", reason: "Abuse", actorUserId: "owner" });
    const { update } = mocks.upsert.mock.calls[0][0];
    expect(update).toEqual({ sessionInvalidBefore: expect.any(Date) });
  });
  it("refuses to restore Linkar access while the Auth ban is still in force", async () => {
    mocks.lookup.mockResolvedValue({ data: { user: { id: "user", banned_until: "2126-01-01T00:00:00Z" } }, error: null });
    await expect(setAdminUserAccess("user", { action: "RESTORE", reason: "Appeal", actorUserId: "owner" })).rejects.toMatchObject({ status: 409, code: "auth_ban_active" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("restores Linkar access once the ban has expired", async () => {
    mocks.lookup.mockResolvedValue({ data: { user: { id: "user", banned_until: "2020-01-01T00:00:00Z" } }, error: null });
    await setAdminUserAccess("user", { action: "RESTORE", reason: "Appeal", actorUserId: "owner" });
    expect(mocks.upsert.mock.calls[0][0].update).toMatchObject({ status: "ACTIVE" });
  });
  it("reports a failed Auth unban", async () => {
    mocks.update.mockResolvedValue({ data: { user: null }, error: { status: 500 } });
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

describe("user membership commands share the workspace guard", () => {
  it("refuses to add a member to a workspace queued for deletion", async () => {
    mocks.findWorkspace.mockResolvedValue({ status: "SUSPENDED", deletionScheduledAt: new Date() });
    await expect(changeAdminUserMembership("user", { action: "ADD", workspaceId: "w1", role: "MEMBER" })).rejects.toMatchObject({ status: 409, code: "deletion_in_progress" });
    expect(mocks.createMember).not.toHaveBeenCalled();
  });
  it("reports a missing workspace as not found", async () => {
    mocks.findWorkspace.mockResolvedValue(null);
    await expect(changeAdminUserMembership("user", { action: "ADD", workspaceId: "missing", role: "MEMBER" })).rejects.toMatchObject({ status: 404, code: "workspace_not_found" });
  });
});
