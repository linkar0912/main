import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { createAdminOperationsRepository } = await import("./repository");
const SECRET = "operations-cursor-secret-at-least-32-characters";
const at = new Date("2026-08-31T10:00:00.000Z");

describe("admin operations repository", () => {
  it("paginates deliveries deterministically when timestamps match", async () => {
    const rows = ["d3", "d2", "d1"].map((id) => ({ id, kind: "AUTOMATION_DM", state: "FAILED", version: 1, resultCode: "PROVIDER_REJECTED", lastError: "provider rejected user message", attemptCount: 1, createdAt: at, updatedAt: at, instagramAccountId: "ig1", workspace: { id: "w1", name: "Acme" } }));
    const findMany = vi.fn(async (args: { where?: { OR?: unknown } }) => args.where?.OR ? rows.slice(2) : rows);
    const repository = createAdminOperationsRepository({ outboundDelivery: { findMany } } as never, SECRET);
    const first = await repository.list("delivery", { limit: 2 });
    const second = await repository.list("delivery", { limit: 2, cursor: first.nextCursor });
    expect(first.items.map(({ id }) => id)).toEqual(["d3", "d2"]);
    expect(second.items.map(({ id }) => id)).toEqual(["d1"]);
  });

  it("never returns webhook payloads or delivery message bodies", async () => {
    const repository = createAdminOperationsRepository({ webhookEvent: { findUnique: vi.fn().mockResolvedValue({ id: "h1", providerEventId: "event-1", eventType: "comment.created", receivedAt: at, processedAt: null, version: 1, adminReprocessCount: 0, workspace: { id: "w1", name: "Acme" }, payload: { accessToken: "secret", text: "private" } }) } } as never, SECRET);
    const detail = await repository.get("webhook", "h1");
    expect(JSON.stringify(detail)).not.toMatch(/accessToken|payload|messageBody|private/);
  });
});

it("rejects unknown statuses before reaching Prisma", async () => {
  const findMany = vi.fn();
  const repository = createAdminOperationsRepository({ automation: { findMany } } as never, SECRET);
  await expect(repository.list("automation", { status: "NOT_A_STATUS" })).rejects.toBeInstanceOf(Error);
  expect(findMany).not.toHaveBeenCalled();
});
it("uses the actual automation provider even before an account is bound", async () => {
  const findMany = vi.fn().mockResolvedValue([{ id: "a", name: "Unbound", provider: "FACEBOOK", status: "DRAFT", version: 1, createdAt: at, updatedAt: at, instagramAccountId: null, facebookPageId: null, _count: { executions: 0, participants: 0 }, workspace: { id: "w", name: "Workspace" } }]);
  const repository = createAdminOperationsRepository({ automation: { findMany } } as never, SECRET);
  const result = await repository.list("automation", { provider: "facebook" });
  expect(findMany.mock.calls[0][0].where).toMatchObject({ provider: "FACEBOOK" });
  expect(result.items[0].provider).toBe("facebook");
});
