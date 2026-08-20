import { describe, expect, it } from "vitest";
import { createId } from "./id";

describe("createId", () => {
  it("creates a stable prefix and unique identifier", () => {
    const first = createId("flow");
    const second = createId("flow");
    expect(first.startsWith("flow_")).toBe(true);
    expect(second.startsWith("flow_")).toBe(true);
    expect(first).not.toBe(second);
  });
});
