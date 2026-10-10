import { afterEach, describe, expect, it, vi } from "vitest";
import { createBackgroundTasks } from "./background-tasks";

describe("worker background tasks", () => {
  afterEach(() => vi.useRealTimers());

  it("stops scheduling on shutdown and waits for the run in progress", async () => {
    vi.useFakeTimers();
    const background = createBackgroundTasks();
    let finish!: () => void;
    const task = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));

    background.every("Retention sweep", 1_000, task);
    expect(task).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopping = background.stop(30_000).then((drained) => { stopped = drained; });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(stopped).toBe(false); // still waiting for the in-flight sweep
    expect(task).toHaveBeenCalledTimes(1); // and no new runs were started

    finish();
    await stopping;
    expect(stopped).toBe(true);
  });

  it("never overlaps a task with itself", async () => {
    vi.useFakeTimers();
    const background = createBackgroundTasks();
    const task = vi.fn(() => new Promise<void>(() => undefined));

    background.every("Sequence sweep", 1_000, task, { firstRunDelayMs: 500 });
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(task).toHaveBeenCalledTimes(1);
    // A sweep that never finishes cannot hold shutdown hostage.
    const stopping = background.stop(100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(stopping).resolves.toBe(false);
  });

  it("contains a failing task so later ticks still run", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const background = createBackgroundTasks();
    const task = vi.fn().mockRejectedValueOnce(new Error("database unavailable")).mockResolvedValue(undefined);

    background.every("Inbox reconciliation", 1_000, task);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(task).toHaveBeenCalledTimes(2);
    await background.stop(1_000);
  });
});
