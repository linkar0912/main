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
 * UI numbers them that way too.
 *
 * Only errors that are known to carry user-facing text keep their message:
 * ZodError, ValidationError (thrown deliberately with a human sentence) and
 * channel-definition errors. Anything else - a Prisma invocation error, a
 * driver timeout, a TypeError - collapses to `fallback`, because its message
 * can contain query text, table names or other internals.
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
  if (isValidationError(error) && error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

/** An input problem whose message is written for the person who sent the request. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * True for errors caused by the request's content (respond 400) rather than by
 * the server (respond 500). Channel-definition errors are matched by their
 * code so this module stays free of the automation schema (it ships to the
 * browser through toReadableApiError).
 */
export function isValidationError(error: unknown): boolean {
  return error instanceof z.ZodError
    || error instanceof ValidationError
    || (error instanceof Error && (error as { code?: unknown }).code === "invalid_channel_definition");
}

const API_ERROR_MESSAGES: Record<string, string> = {
  invalid_channel_target: "Choose a connected Instagram account or Facebook Page.",
  invalid_channel_definition: "This automation has settings that are not supported by the selected channel.",
  forbidden: "Only workspace owners and admins can do this. Ask one of them to make the change.",
  limit_reached: "Your plan's limit for this has been reached. Upgrade or wait for the next billing month.",
};

export function toReadableApiError(error: unknown, fallback: string): string {
  if (typeof error !== "string" || !error.trim()) return fallback;
  const normalized = error.trim();
  if (API_ERROR_MESSAGES[normalized]) return API_ERROR_MESSAGES[normalized];
  if (/^[a-z0-9_]+$/.test(normalized)) {
    const readable = normalized.replaceAll("_", " ");
    return `${readable.charAt(0).toUpperCase()}${readable.slice(1)}.`;
  }
  return normalized;
}
