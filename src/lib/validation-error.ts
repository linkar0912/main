import { z } from "zod";

/** More than this and the banner turns into a wall of text nobody reads. */
const MAX_LISTED_ISSUES = 3;

/**
 * Zod's `error.message` is the raw issue array serialized as JSON. Handing that
 * straight to `NextResponse.json({ error: ... })` - which is what every route
 * doing `error instanceof Error ? error.message : fallback` used to do - dumps a
 * page of `{"code":"invalid_type","path":[...]}` into the user's error banner.
 *
 * This turns the same information into one readable line: the field that failed,
 * followed by why. Array indices are rendered one-based ("steps 2") because the
 * UI numbers them that way too. Non-Zod errors keep their own message, which is
 * usually already human-written ("Source automation not found").
 */
export function toReadableValidationError(error: unknown, fallback: string): string {
  if (error instanceof z.ZodError) {
    const listed = error.issues.slice(0, MAX_LISTED_ISSUES).map((issue) => {
      const field = issue.path
        .map((segment) => (typeof segment === "number" ? String(segment + 1) : String(segment)))
        .join(" ");
      return field ? `${field}: ${issue.message}` : issue.message;
    });
    return listed.length > 0 ? listed.join("; ") : fallback;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
