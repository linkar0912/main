import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "./memory-repository";

async function seedFailed(repository: ReturnType<typeof createMemoryRepository>, workspaceId: string, key: string, errorMessage: string) {
  const input = {
    workspaceId,
    instagramAccountId: "ig_1",
    kind: "CLASSIC_ACTION" as const,
    payload: {},
  };
  const created = await repository.ensureOutboundDelivery({ ...input, deliveryKey: key });
  const claimed = await repository.claimOutboundDelivery(key, "owner_1", "2099-01-01T00:00:00.000Z");
  if (!claimed.claimed) throw new Error(`could not claim ${key}`);
  await repository.failOutboundDelivery(key, "owner_1", errorMessage, true, "RETRYABLE_REJECTION");
  return created;
}

describe("outbound failure listing", () => {
  it("returns FAILED deliveries and skips non-FAILED states", async () => {
    const repository = createMemoryRepository();
    await repository.ensureWorkspace("workspace_f", "owner@team.com");
    await seedFailed(repository, "workspace_f", "delivery_a", "Meta 5xx");
    // A delivery that stays PENDING should be filtered out.
    await repository.ensureOutboundDelivery({
      workspaceId: "workspace_f",
      instagramAccountId: "ig_1",
      kind: "CLASSIC_ACTION",
      deliveryKey: "delivery_b",
      payload: {},
    });
    await seedFailed(repository, "workspace_f", "delivery_c", "Token expired");
    const list = await repository.listRecentOutboundFailures("workspace_f", 10);
    expect(list).toHaveLength(2);
    expect(list.every((entry) => entry.state === "FAILED")).toBe(true);
  });

  it("isolates failures across workspaces", async () => {
    const repository = createMemoryRepository();
    await repository.ensureWorkspace("workspace_x", "owner@team.com");
    await repository.ensureWorkspace("workspace_y", "owner@team.com");
    await seedFailed(repository, "workspace_x", "delivery_x", "Meta 5xx");
    const list = await repository.listRecentOutboundFailures("workspace_y", 10);
    expect(list).toHaveLength(0);
  });
});
