import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { bucketDate, reserveDailySendSlots } from "./send-limits";

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

  it("resets the daily limit at the workspace's midnight, not UTC midnight", async () => {
    const repository = createMemoryRepository();
    await repository.setMessagingWindow("workspace_a", { startHour: 22, endHour: 7, timezone: "Asia/Kolkata" });
    const context = { repository, automationId: "automation_1", workspaceId: "workspace_a", limit: 1 };

    // 23:00 IST on the 23rd, then 01:00 IST on the 24th - still the 23rd in UTC.
    const lateEvening = await reserveDailySendSlots({ ...context, now: new Date("2026-08-23T17:30:00.000Z") }, 1);
    const afterMidnight = await reserveDailySendSlots({ ...context, now: new Date("2026-08-23T19:30:00.000Z") }, 1);

    expect(lateEvening).toEqual({ allowed: true, utcDate: "2026-08-23", amount: 1 });
    expect(afterMidnight).toEqual({ allowed: true, utcDate: "2026-08-24", amount: 1 });
    // Same local day: the limit holds.
    await expect(reserveDailySendSlots({ ...context, now: new Date("2026-08-24T05:00:00.000Z") }, 1))
      .resolves.toEqual({ allowed: false, reason: "daily_limit" });
  });

  it("falls back to UTC dates without a workspace timezone", () => {
    expect(bucketDate(new Date("2026-08-23T23:30:00.000Z"))).toBe("2026-08-23");
    expect(bucketDate(new Date("2026-08-23T23:30:00.000Z"), "Not/AZone")).toBe("2026-08-23");
    expect(bucketDate(new Date("2026-08-23T23:30:00.000Z"), "Asia/Kolkata")).toBe("2026-08-24");
  });
});
