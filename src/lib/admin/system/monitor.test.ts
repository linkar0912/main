import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createSystemMonitor } = await import("./monitor");

describe("system monitor", () => {
  it("snapshots, reconciles, then dispatches pending lifecycle alerts", async () => {
    const snapshot = { generatedAt: "2026-09-05T06:00:00Z" };
    const candidates = [{ fingerprint: "component:redis:unavailable" }];
    const dependencies = {
      snapshot: vi.fn().mockResolvedValue(snapshot),
      evaluate: vi.fn().mockReturnValue(candidates),
      reconcile: vi.fn().mockResolvedValue([{ kind: "OPENED", incident: { id: "i_1" } }]),
      dispatch: vi.fn().mockResolvedValue({ attempted: 1, delivered: 1 }),
      now: () => new Date("2026-09-05T06:00:00Z"),
    };
    const monitor = createSystemMonitor(dependencies as never);
    await expect(monitor.run()).resolves.toMatchObject({ candidates: 1, lifecycleChanges: 1, alertsDelivered: 1 });
    expect(dependencies.evaluate).toHaveBeenCalledWith(snapshot, expect.any(Date));
    expect(dependencies.reconcile).toHaveBeenCalledWith(candidates, expect.anything(), expect.any(Date));
    expect(dependencies.dispatch).toHaveBeenCalledWith(expect.any(Date));
  });

  it("does not overlap a slow monitoring run", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const monitor = createSystemMonitor({
      snapshot: vi.fn().mockImplementation(() => pending.then(() => ({ generatedAt: new Date().toISOString() }))),
      evaluate: vi.fn().mockReturnValue([]), reconcile: vi.fn().mockResolvedValue([]),
      dispatch: vi.fn().mockResolvedValue({ attempted: 0, delivered: 0 }), now: () => new Date(),
    } as never);
    const first = monitor.run();
    await expect(monitor.run()).resolves.toEqual({ skipped: true });
    release();
    await first;
  });
});
