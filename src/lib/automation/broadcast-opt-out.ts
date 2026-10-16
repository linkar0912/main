/**
 * The plain opt-out line Linkar adds to the end of every broadcast DM.
 * Replying with the keyword is an opt-out command (isOptOutCommand in
 * runner.ts), so the person is suppressed before any other logic runs.
 *
 * This module has no imports on purpose: the manual-reply echo check loads it
 * to recognise Linkar's own broadcasts without pulling in the broadcast
 * runner's dependencies.
 */
export const BROADCAST_OPT_OUT_LINE = "Reply STOP to stop these messages.";

/** Longest text DM Linkar sends; the broadcast composer enforces the same cap. */
export const MAX_DM_TEXT_LENGTH = 1_000;

/** Characters the opt-out line takes, including the blank line before it. */
const OPT_OUT_SUFFIX_LENGTH = BROADCAST_OPT_OUT_LINE.length + 2;

/** Longest broadcast text that still leaves room for the opt-out line. */
export const MAX_BROADCAST_TEXT_WITH_OPT_OUT = MAX_DM_TEXT_LENGTH - OPT_OUT_SUFFIX_LENGTH;

/**
 * Text that already tells people how to opt out with STOP: "Reply STOP",
 * "text us STOP", "respond with 'stop'", a quoted "STOP", or "STOP to
 * unsubscribe". A bare STOP is not enough, because caps-heavy promotional copy
 * such as "NON-STOP SALE" or "DON'T STOP SHOPPING" uses it as an ordinary word.
 */
const STOP_INSTRUCTIONS = [
  /\b(?:reply|respond|send|text|type|message|dm)\s+(?:(?:with|us)\s+)?["'“‘]?stop\b/i,
  /["'“‘]stop["'”’]/i,
  /(?<![\w-])stop\s+to\s+(?:stop|unsubscribe|opt[\s-]?out|end|cancel|quit)\b/i,
];

function mentionsStopInstruction(text: string): boolean {
  return STOP_INSTRUCTIONS.some((pattern) => pattern.test(text));
}

/**
 * Appends the opt-out line once. Text that already tells people about STOP is
 * left alone, and so is text with no room left under the DM length cap:
 * pushing it past the cap would make Meta reject the whole message.
 */
export function withBroadcastOptOutLine(text: string): string {
  const body = text.trimEnd();
  if (mentionsStopInstruction(body)) return text;
  if (body.length > MAX_BROADCAST_TEXT_WITH_OPT_OUT) return text;
  return `${body}\n\n${BROADCAST_OPT_OUT_LINE}`;
}

/**
 * The message text with a trailing opt-out line taken off, so a broadcast as
 * Meta echoes it can be compared with the text Linkar stored for it. Text
 * without the line comes back trimmed and otherwise unchanged.
 */
export function withoutBroadcastOptOutLine(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.endsWith(BROADCAST_OPT_OUT_LINE)) return trimmed;
  return trimmed.slice(0, -BROADCAST_OPT_OUT_LINE.length).trim();
}
