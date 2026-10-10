import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger";

describe("logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("never lets caller context overwrite level, message or time", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logger.error("delivery failed", { level: "info", message: "spoofed", time: "never", jobId: "j1" });
    const line = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(line).toMatchObject({ level: "error", message: "delivery failed", jobId: "j1" });
    expect(line.time).not.toBe("never");
  });
});
