import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toReadableApiError, toReadableValidationError } from "./validation-error";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  steps: z.array(z.object({ text: z.string().trim().min(1) })).min(1),
});

describe("toReadableApiError", () => {
  it("translates channel target codes into instructions", () => {
    expect(toReadableApiError("invalid_channel_target", "Could not save"))
      .toBe("Choose a connected Instagram account or Facebook Page.");
  });

  it("humanizes unknown machine-readable errors", () => {
    expect(toReadableApiError("provider_temporarily_unavailable", "Could not save"))
      .toBe("Provider temporarily unavailable.");
  });
});

function errorFrom(input: unknown): unknown {
  try {
    schema.parse(input);
    throw new Error("expected the schema to reject this input");
  } catch (caught) {
    return caught;
  }
}

describe("toReadableValidationError", () => {
  it("names the offending field instead of dumping the raw issue array", () => {
    const message = toReadableValidationError(errorFrom({ name: "", steps: [{ text: "hi" }] }), "Invalid sequence");

    expect(message).toContain("name");
    expect(message).not.toContain("[");
    expect(message).not.toContain("\"code\"");
  });

  it("points at the specific array entry that failed", () => {
    const message = toReadableValidationError(
      errorFrom({ name: "Nurture", steps: [{ text: "hi" }, { text: "" }] }),
      "Invalid sequence",
    );

    expect(message).toContain("steps");
    expect(message).toContain("2");
  });

  it("joins several problems into one line and caps how many it lists", () => {
    const message = toReadableValidationError(
      errorFrom({ name: "", steps: [{ text: "" }, { text: "" }, { text: "" }, { text: "" }] }),
      "Invalid sequence",
    );

    expect(message.split(";").length).toBeLessThanOrEqual(3);
  });

  it("passes through a plain Error's own message", () => {
    expect(toReadableValidationError(new Error("Source automation not found"), "Invalid sequence"))
      .toBe("Source automation not found");
  });

  it("falls back when handed something that is not an error at all", () => {
    expect(toReadableValidationError("nope", "Invalid sequence")).toBe("Invalid sequence");
  });
});
