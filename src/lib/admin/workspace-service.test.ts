import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), lookup: vi.fn(), findWorkspace: vi.fn(), findMember: vi.fn(), createMember: vi.fn(), deleteMembers: vi.fn(),
  findOwnerMember: vi.fn(), findAudit: vi.fn(), updateWorkspaces: vi.fn(), countWorkspaces: vi.fn(), findAutomations: vi.fn(), updateAutomations: vi.fn(),
  findExport: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ platformOwnerUserIds: ["11111111-1111-4111-8111-111111111111"] }) }));
vi.mock("@/src/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ auth: { admin: { getUserById: mocks.lookup } } }) }));
const transactionClient = {
  workspace: { findUnique: mocks.findWorkspace, updateMany: mocks.updateWorkspaces, count: mocks.countWorkspaces },
  workspaceMember: { findFirst: mocks.findMember, create: mocks.createMember, deleteMany: mocks.deleteMembers },
  automation: { findMany: mocks.findAutomations, updateMany: mocks.updateAutomations },
};
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  $transaction: mocks.transaction,
  workspaceMember: { findFirst: mocks.findOwnerMember },
  adminAuditEvent: { findFirst: mocks.findAudit },
  workspace: { findUnique: mocks.findExport },
} }));
const { changeAdminWorkspaceMember, pauseAdminWorkspaceAutomations, removeAdminWorkspaceMember, resumeAdminWorkspaceAutomations, loadSafeWorkspaceExport, workspaceExportCsv, WORKSPACE_EXPORT_ROW_LIMIT } = await import("./workspace-service");

const USER = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation((work: (tx: unknown) => unknown) => work(transactionClient));
  mocks.lookup.mockResolvedValue({ data: { user: { id: USER, email: "member@acme.test" } }, error: null });
  mocks.findWorkspace.mockResolvedValue({ status: "ACTIVE", deletionScheduledAt: null });
  mocks.findOwnerMember.mockResolvedValue(null);
});

describe("workspaceExportCsv", () => {
  it("formula-escapes cells and excludes secret-bearing fields by construction", () => {
    const csv = workspaceExportCsv({
      id: "w1", name: "=IMPORTXML()", slug: "safe", status: "ACTIVE",
      createdAt: new Date("2026-08-31T10:00:00.000Z"), updatedAt: new Date("2026-08-31T10:00:00.000Z"),
      members: [{ userId: "u1", email: "+danger@example.com", role: "OWNER" }],
      automations: [], contacts: [],
    });
    expect(csv).toContain("'=IMPORTXML()");
    expect(csv).toContain("'+danger@example.com");
    expect(csv).not.toMatch(/token|password|secret/i);
  });
  it("rejects a workspace above the export row cap", async () => {
    const contacts = Array.from({ length: WORKSPACE_EXPORT_ROW_LIMIT }, (_, index) => ({ id: `c${index}` }));
    mocks.findExport.mockResolvedValue({ id: "w1", members: [], automations: [], contacts });
    await expect(loadSafeWorkspaceExport("w1")).rejects.toMatchObject({ status: 422, code: "export_too_large" });
    expect(mocks.findExport.mock.calls[0][0].select.contacts.take).toBe(WORKSPACE_EXPORT_ROW_LIMIT + 1);
  });
});

describe("workspace membership guard", () => {
  it("refuses to add members to a workspace queued for deletion", async () => {
    mocks.findWorkspace.mockResolvedValue({ status: "SUSPENDED", deletionScheduledAt: new Date() });
    await expect(changeAdminWorkspaceMember("w1", { action: "ADD", userId: USER, role: "MEMBER" })).rejects.toMatchObject({ status: 409, code: "deletion_in_progress" });
    expect(mocks.createMember).not.toHaveBeenCalled();
  });
  it("answers not found for a missing workspace instead of a foreign-key error", async () => {
    mocks.findWorkspace.mockResolvedValue(null);
    await expect(changeAdminWorkspaceMember("missing", { action: "ADD", userId: USER, role: "MEMBER" })).rejects.toMatchObject({ status: 404, code: "workspace_not_found" });
  });
  it("never changes a platform owner's membership", async () => {
    await expect(changeAdminWorkspaceMember("w1", { action: "ADD", userId: "11111111-1111-4111-8111-111111111111", role: "MEMBER" })).rejects.toMatchObject({ status: 403, code: "platform_owner_protected" });
    await expect(removeAdminWorkspaceMember("w1", "11111111-1111-4111-8111-111111111111")).rejects.toMatchObject({ status: 403, code: "platform_owner_protected" });
    expect(mocks.deleteMembers).not.toHaveBeenCalled();
  });
});

describe("pause and resume automations", () => {
  it("records each paused automation with its post-pause version", async () => {
    mocks.updateWorkspaces.mockResolvedValue({ count: 1 });
    mocks.findAutomations.mockResolvedValue([{ id: "a1", version: 2 }, { id: "a2", version: 5 }]);
    mocks.updateAutomations.mockResolvedValue({ count: 1 });
    await expect(pauseAdminWorkspaceAutomations("w1", 7)).resolves.toEqual({ paused: 2, automationIds: [["a1@3", "a2@6"]], version: 8 });
  });
  it("resumes only automations unchanged since the last pause", async () => {
    mocks.findAudit.mockResolvedValue({ requestId: "req", after: { automationIds: [["a1@3", "a2@6"]] } });
    mocks.updateWorkspaces.mockResolvedValue({ count: 1 });
    mocks.updateAutomations.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(resumeAdminWorkspaceAutomations("w1", 8)).resolves.toMatchObject({ resumed: 1, skipped: 1, automationIds: [["a1"]], version: 9 });
    expect(mocks.updateAutomations.mock.calls[0][0].where).toEqual({ id: "a1", workspaceId: "w1", version: 3, status: "PAUSED", archivedAt: null });
  });
  it("reports when no pause was recorded", async () => {
    mocks.findAudit.mockResolvedValue(null);
    await expect(resumeAdminWorkspaceAutomations("w1", 8)).rejects.toMatchObject({ status: 409, code: "nothing_to_resume" });
  });
});
