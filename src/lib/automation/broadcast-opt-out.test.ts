import { describe, expect, it } from "vitest";
import {
  BROADCAST_OPT_OUT_LINE,
  MAX_BROADCAST_TEXT_WITH_OPT_OUT,
  MAX_DM_TEXT_LENGTH,
  withBroadcastOptOutLine,
  withoutBroadcastOptOutLine,
} from "./broadcast-opt-out";
import { isOptOutCommand } from "./runner";

const withLine = (text: string) => `${text}\n\n${BROADCAST_OPT_OUT_LINE}`;

describe("withBroadcastOptOutLine", () => {
  it("appends the line once and never twice", () => {
    const once = withBroadcastOptOutLine("Big news!");
    expect(once).toBe("Big news!\n\nReply STOP to stop these messages.");
    expect(withBroadcastOptOutLine(once)).toBe(once);
    expect(withBroadcastOptOutLine("Big news!  \n")).toBe(once);
  });

  it("leaves text alone when it already tells people about STOP", () => {
    for (const text of [
      "Sale ends Sunday. Text STOP to opt out.",
      "Sale ends Sunday. Reply stop to opt out",
      "Sale ends Sunday. Reply \"stop\" anytime",
      "Sale ends Sunday. Respond with STOP to leave the list",
      "Sale ends Sunday. Text us STOP",
      "Sale ends Sunday. Send “STOP” anytime",
      "Sale ends Sunday. 'STOP' ends these messages",
      "Sale ends Sunday. STOP to unsubscribe",
      "Sale ends Sunday. Stop to opt-out",
    ]) {
      expect(withBroadcastOptOutLine(text)).toBe(text);
    }
  });

  it("still adds the line when stop only appears as an ordinary word", () => {
    for (const text of [
      "Non-stop deals all week",
      "Don't stop now",
      "NON-STOP SALE THIS WEEKEND",
      "DON'T STOP SHOPPING",
      "STOP BY THE STORE TODAY",
      "NON-STOP TO THE END OF THE MONTH",
    ]) {
      expect(withBroadcastOptOutLine(text)).toBe(withLine(text));
    }
  });

  it("does not push a message past the 1,000 character cap", () => {
    expect(MAX_DM_TEXT_LENGTH).toBe(1_000);
    expect(MAX_BROADCAST_TEXT_WITH_OPT_OUT).toBe(1_000 - BROADCAST_OPT_OUT_LINE.length - 2);
    const full = "a".repeat(1_000);
    expect(withBroadcastOptOutLine(full)).toBe(full);
    const tooLong = "a".repeat(MAX_BROADCAST_TEXT_WITH_OPT_OUT + 1);
    expect(withBroadcastOptOutLine(tooLong)).toBe(tooLong);
    const roomy = "a".repeat(MAX_BROADCAST_TEXT_WITH_OPT_OUT);
    expect(withBroadcastOptOutLine(roomy)).toHaveLength(1_000);
  });

  it("names a keyword the opt-out handling recognises", () => {
    const keyword = /Reply (\S+) to/.exec(BROADCAST_OPT_OUT_LINE)?.[1];
    expect(keyword).toBe("STOP");
    expect(isOptOutCommand(keyword!)).toBe(true);
    expect(isOptOutCommand(keyword!.toLowerCase())).toBe(true);
  });
});

describe("withoutBroadcastOptOutLine", () => {
  it("takes the appended line off a broadcast's text", () => {
    expect(withoutBroadcastOptOutLine(withBroadcastOptOutLine("Big news!"))).toBe("Big news!");
    expect(withoutBroadcastOptOutLine(`Big news!\r\n\r\n${BROADCAST_OPT_OUT_LINE}  `)).toBe("Big news!");
    expect(withoutBroadcastOptOutLine(`  Line one\nLine two\n\n${BROADCAST_OPT_OUT_LINE}`)).toBe("Line one\nLine two");
  });

  it("returns other text trimmed and otherwise unchanged", () => {
    expect(withoutBroadcastOptOutLine("  Thanks, I will check  ")).toBe("Thanks, I will check");
    expect(withoutBroadcastOptOutLine(`${BROADCAST_OPT_OUT_LINE} Not at the end`)).toBe(`${BROADCAST_OPT_OUT_LINE} Not at the end`);
    expect(withoutBroadcastOptOutLine(BROADCAST_OPT_OUT_LINE)).toBe("");
  });
});
