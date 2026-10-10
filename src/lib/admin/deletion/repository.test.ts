import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ authSessionSecret: "deletion-cursor-secret-at-least-32-characters" }) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { adminDeletionJob: { create: mocks.create, findMany: mocks.findMany, findFirst: mocks.findFirst, findUnique: mocks.findUnique, updateMany: mocks.updateMany } } }));
const { createDeletionJob, listDeletionJobs, resetFailedDeletion } = await import("./repository");

beforeEach(() => vi.resetAllMocks());

it("maps a lost race on the active-target index to a structured conflict", async () => {
  mocks.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
  await expect(createDeletionJob({
    target: { kind: "WORKSPACE", id: "w1" },
    preview: { impact: { version: 2 }, impactDigest: "d", confirmationPhrase: "p" },
    includeAuthUsers: false,
    context: { owner: { userId: "o", email: "o@example.com" }, reason: "r", idempotencyKey: "k" },
  } as never)).rejects.toMatchObject({ status: 409, code: "deletion_already_active" });
});

it("refuses to requeue a failed job while another job for the target is active", async () => {
  mocks.findUnique.mockResolvedValue({ targetKind: "WORKSPACE", targetId: "w1" });
  mocks.findFirst.mockResolvedValue({ id: "other", state: "QUEUED" });
  await expect(resetFailedDeletion("job")).rejects.toMatchObject({ status: 409, code: "deletion_already_active" });
  expect(mocks.findFirst.mock.calls[0][0].where).toMatchObject({ targetKind: "WORKSPACE", targetId: "w1", id: { not: "job" } });
  expect(mocks.updateMany).not.toHaveBeenCalled();
});

it("pages deletion jobs with a signed keyset cursor", async () => {
  const at = new Date("2026-10-10T10:00:00.000Z");
  const rows = ["j3", "j2", "j1"].map((id) => ({ id, createdAt: at, stages: [] }));
  mocks.findMany.mockImplementation(async (args: { where?: unknown; take: number }) => (args.where ? rows.slice(2) : rows).slice(0, args.take));
  const first = await listDeletionJobs({ limit: 2 });
  expect(first.items.map(({ id }) => id)).toEqual(["j3", "j2"]);
  expect(first.nextCursor).toBeTruthy();
  const second = await listDeletionJobs({ limit: 2, cursor: first.nextCursor });
  expect(mocks.findMany.mock.calls[1][0].where).toEqual({ OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: "j2" } }] });
  expect(second).toEqual({ items: [rows[2]], nextCursor: null });
  await expect(listDeletionJobs({ cursor: "forged.cursor" })).rejects.toMatchObject({ code: "invalid_cursor" });
});
