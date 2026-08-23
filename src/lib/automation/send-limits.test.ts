import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { reserveDailySendSlots } from "./send-limits";

describe("atomic daily send limits", () => {
  it("reserves exact message slots without exceeding the limit", async () => {
    const repository = createMemoryRepository();
    const context = {
      repository,
      automationId: "automation_1",
      limit: 3,
      now: new Date("2026-08-23T23:59:59.000Z"),
    };

    const results = await Promise.all([
      reserveDailySendSlots(context, 2),
      reserveDailySendSlots(context, 2),
    ]);

    expect(results.filter((result) => result.allowed)).toHaveLength(1);
    expect(results.find((result) => !result.allowed)).toEqual({
      allowed: false,
      reason: "daily_limit",
    });
  });

  it("does not create quota rows when no limit is configured", async () => {
    const repository = createMemoryRepository();

    await expect(reserveDailySendSlots({
      repository,
      automationId: "automation_1",
      now: new Date("2026-08-23T10:00:00.000Z"),
    }, 4)).resolves.toEqual({
      allowed: true,
      utcDate: "2026-08-23",
      amount: 0,
    });
  });
});
