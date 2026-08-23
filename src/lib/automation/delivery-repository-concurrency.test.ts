import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "../memory-repository";

describe("delivery repository concurrency", () => {
  it("does not overbook an automation daily send limit", async () => {
    const repository = createMemoryRepository();

    const results = await Promise.all([
      repository.claimAutomationSendSlots("automation_1", "2026-08-23", 2, 3),
      repository.claimAutomationSendSlots("automation_1", "2026-08-23", 2, 3),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    await repository.releaseAutomationSendSlots("automation_1", "2026-08-23", 1);
    await expect(repository.claimAutomationSendSlots(
      "automation_1",
      "2026-08-23",
      2,
      3,
    )).resolves.toBe(true);
  });
});
