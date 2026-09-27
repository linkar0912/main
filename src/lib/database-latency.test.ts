import { describe, expect, it, vi } from "vitest";

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock("./logger", () => ({ logger }));

const { measureDatabaseLatency, reportDatabaseLatency } = await import("./database-latency");

function delayedQuery(delays: number[]) {
  let call = 0;
  return () => new Promise((resolve) => setTimeout(resolve, delays[Math.min(call++, delays.length - 1)]));
}

describe("database latency probe", () => {
  it("reports the median of the timed samples, ignoring the warm-up query", async () => {
    const query = vi.fn(delayedQuery([200, 5, 5, 5, 5, 5]));
    const median = await measureDatabaseLatency(query, 5);
    expect(query).toHaveBeenCalledTimes(6);
    expect(median).toBeLessThan(100);
  });

  it("warns when the round trip looks cross-region", async () => {
    await reportDatabaseLatency("worker", delayedQuery([60]));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("different region"),
      expect.objectContaining({ process: "worker" }),
    );
  });

  it("never throws when the database is unreachable", async () => {
    await expect(reportDatabaseLatency("worker", () => Promise.reject(new Error("down")))).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith("Database latency probe failed", expect.objectContaining({ error: "down" }));
  });
});
