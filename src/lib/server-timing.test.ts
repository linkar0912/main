import { afterEach, describe, expect, it, vi } from "vitest";

const logInfo = vi.hoisted(() => vi.fn());
vi.mock("./logger", () => ({ logger: { info: logInfo } }));

const { measureServerOperation } = await import("./server-timing");

describe("measureServerOperation", () => {
  afterEach(() => {
    logInfo.mockReset();
    vi.restoreAllMocks();
  });

  it("returns the operation result and records only duration and outcome", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(112.345);

    await expect(measureServerOperation("billing.view.service", async () => "ready")).resolves.toBe("ready");

    expect(logInfo).toHaveBeenCalledWith("server operation timing", {
      operation: "billing.view.service",
      durationMs: 12.35,
      ok: true,
    });
  });

  it("records a failed operation without swallowing its error", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(10).mockReturnValueOnce(14);
    const failure = new Error("database unavailable");

    await expect(measureServerOperation("facebook.connections.repository", async () => { throw failure; })).rejects.toBe(failure);
    expect(logInfo).toHaveBeenCalledWith("server operation timing", {
      operation: "facebook.connections.repository",
      durationMs: 4,
      ok: false,
    });
  });

  it("rejects arbitrary operation names and extra metadata", async () => {
    await expect(measureServerOperation("workspace.email.lookup" as never, async () => null)).rejects.toThrow("Unsupported server timing operation");
    await expect((measureServerOperation as unknown as (...args: unknown[]) => Promise<unknown>)(
      "billing.view.service",
      async () => null,
      { email: "private@example.com" },
    )).rejects.toThrow("Server timing metadata is not accepted");
    expect(logInfo).not.toHaveBeenCalled();
  });
});
