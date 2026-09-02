import { describe, expect, it } from "vitest";
import { sequenceSchema } from "./sequence";

const base = {
  name: "Nurture",
  status: "ACTIVE" as const,
};

describe("sequenceSchema step delays", () => {
  it("accepts a same-window step delay", () => {
    const parsed = sequenceSchema.safeParse({
      ...base,
      steps: [
        { id: "s1", delayHours: 0, text: "Day zero tip" },
        { id: "s2", delayHours: 23, text: "Later today" },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a 24-hour step delay, which Meta's messaging window makes undeliverable", () => {
    const parsed = sequenceSchema.safeParse({
      ...base,
      steps: [
        { id: "s1", delayHours: 0, text: "Day zero tip" },
        { id: "s2", delayHours: 24, text: "Tomorrow" },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects the multi-day drip delays the old 90-day ceiling allowed", () => {
    for (const delayHours of [48, 72, 24 * 30]) {
      const parsed = sequenceSchema.safeParse({
        ...base,
        steps: [{ id: "s1", delayHours, text: "Much later" }],
      });
      expect(parsed.success, `delayHours=${delayHours} must be rejected`).toBe(false);
    }
  });
});
