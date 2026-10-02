import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ platformOwnerUserIds: [] }) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/src/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
const { digestDeletionImpact, deletionConfirmationPhrase, previewDeletion } = await import("./impact");
describe("deletion impact", () => {
  it("uses stable canonical digests and exact target phrases", () => {
    const first = { version: 1 as const, target: { kind: "WORKSPACE" as const, id: "w1" }, identity: { label: "Acme" }, counts: { contacts: 2, automations: 1 }, memberUserIds: [], warnings: [] };
    const second = { ...first, counts: { automations: 1, contacts: 2 } };
    expect(digestDeletionImpact(first)).toBe(digestDeletionImpact(second));
    expect(deletionConfirmationPhrase(first.target)).toBe("DELETE WORKSPACE w1");
  });
});

it("reports Auth outages separately from missing deletion targets", async () => {
  const { createSupabaseAdminClient } = await import("@/src/lib/supabase/admin");
  vi.mocked(createSupabaseAdminClient).mockReturnValue({ auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: null }, error: { status: 503 } }) } } } as never);
  await expect(previewDeletion({ kind: "USER", id: "user" })).rejects.toMatchObject({ status: 502, code: "auth_lookup_failed" });
});
