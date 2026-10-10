import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), members: vi.fn(), count: vi.fn() }));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ platformOwnerUserIds: ["owner-protected"] }) }));
vi.mock("@/src/lib/prisma", () => {
  const counted = { count: mocks.count };
  const transaction = {
    workspace: { findUnique: mocks.workspace },
    workspaceMember: { findMany: mocks.members },
    automation: counted, automationContact: counted, automationParticipant: counted, automationExecution: counted,
    webhookEvent: counted, outboundDelivery: counted, instagramConnection: counted, facebookPageConnection: counted,
    automationSequence: counted, broadcast: counted, trackedLink: counted,
  };
  return { prisma: { $transaction: (operation: (tx: unknown) => unknown) => operation(transaction) } };
});
vi.mock("@/src/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
const { deletionImpactMatches, digestDeletionImpact, deletionConfirmationPhrase, previewDeletion } = await import("./impact");

beforeEach(() => {
  mocks.workspace.mockResolvedValue({ name: "Acme", status: "ACTIVE", deletionScheduledAt: null });
  mocks.members.mockResolvedValue([{ userId: "u2" }, { userId: "u1" }]);
  mocks.count.mockResolvedValue(3);
});

describe("deletion impact", () => {
  it("uses stable canonical digests and exact target phrases", () => {
    const first = { version: 1 as const, target: { kind: "WORKSPACE" as const, id: "w1" }, identity: { label: "Acme" }, counts: { contacts: 2, automations: 1 }, memberUserIds: [], warnings: [] };
    const second = { ...first, counts: { automations: 1, contacts: 2 } };
    expect(digestDeletionImpact(first)).toBe(digestDeletionImpact(second));
    expect(deletionConfirmationPhrase(first.target)).toBe("DELETE WORKSPACE w1");
  });

  it("keeps the digest when only live row counts change", async () => {
    const before = await previewDeletion({ kind: "WORKSPACE", id: "w1" });
    mocks.count.mockResolvedValue(4_000);
    const after = await previewDeletion({ kind: "WORKSPACE", id: "w1" });
    expect(after.impact.counts.contacts).toBe(4_000);
    expect(after.impactDigest).toBe(before.impactDigest);
    expect(before.impact.structure).toEqual({ target: { kind: "WORKSPACE", id: "w1" }, memberUserIds: ["u1", "u2"], protected: false, workspaceStatus: "ACTIVE" });
  });

  it("changes the digest when the member identities change", async () => {
    const before = await previewDeletion({ kind: "WORKSPACE", id: "w1" });
    mocks.members.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }, { userId: "u3" }]);
    const after = await previewDeletion({ kind: "WORKSPACE", id: "w1" });
    expect(after.impactDigest).not.toBe(before.impactDigest);
    expect(deletionImpactMatches({ impact: before.impact, impactDigest: before.impactDigest }, after)).toBe(false);
  });

  it("allows suspended workspaces and rejects one already locked by a deletion", async () => {
    mocks.workspace.mockResolvedValue({ name: "Acme", status: "SUSPENDED", deletionScheduledAt: null });
    await expect(previewDeletion({ kind: "WORKSPACE", id: "w1" })).resolves.toMatchObject({ impact: { structure: { workspaceStatus: "SUSPENDED" } } });
    mocks.workspace.mockResolvedValue({ name: "Acme", status: "SUSPENDED", deletionScheduledAt: new Date() });
    await expect(previewDeletion({ kind: "WORKSPACE", id: "w1" })).rejects.toMatchObject({ status: 409, code: "deletion_in_progress" });
  });

  it("rejects a workspace that includes a platform owner", async () => {
    mocks.members.mockResolvedValue([{ userId: "owner-protected" }]);
    await expect(previewDeletion({ kind: "WORKSPACE", id: "w1" })).rejects.toMatchObject({ status: 403, code: "protected_target" });
  });

  it("revalidates legacy count-based jobs on their target and members", async () => {
    const fresh = await previewDeletion({ kind: "WORKSPACE", id: "w1" });
    const legacy = { version: 1, target: { kind: "WORKSPACE", id: "w1" }, memberUserIds: ["u2", "u1"], counts: { contacts: 1 } };
    expect(deletionImpactMatches({ impact: legacy, impactDigest: "0".repeat(64) }, fresh)).toBe(true);
    expect(deletionImpactMatches({ impact: { ...legacy, memberUserIds: ["u1"] }, impactDigest: "0".repeat(64) }, fresh)).toBe(false);
  });
});

it("reports Auth outages separately from missing deletion targets", async () => {
  const { createSupabaseAdminClient } = await import("@/src/lib/supabase/admin");
  vi.mocked(createSupabaseAdminClient).mockReturnValue({ auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: null }, error: { status: 503 } }) } } } as never);
  await expect(previewDeletion({ kind: "USER", id: "user" })).rejects.toMatchObject({ status: 502, code: "auth_lookup_failed" });
});
