/**
 * Friendly names for greetings and the account chip.
 *
 * Signed-in people are identified by email, and a raw local part makes a poor
 * greeting ("Hello, Tejastelkar9!"). A profile display name wins when one is
 * known; otherwise the local part is cleaned up into a first name, and when
 * nothing human is left (role mailboxes, digits) callers fall back to a
 * neutral phrase instead of inventing one.
 */

/** Shared inboxes whose local part is a job, not a person. */
const ROLE_MAILBOXES = new Set([
  "admin", "administrator", "contact", "hello", "help", "hi", "info", "mail", "marketing",
  "me", "noreply", "office", "owner", "sales", "social", "support", "team", "test", "user",
]);

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** First word of a display name, if it has any letters. */
function firstNameFromDisplayName(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0] ?? "";
  if (!/\p{L}/u.test(first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/**
 * "tejas.telkar@x" -> "Tejas", "tejastelkar9@x" -> "Tejastelkar",
 * "priya_92@x" -> "Priya"; null for "admin@x", "12345@x" or "".
 */
export function firstNameFromEmail(email: string | null | undefined): string | null {
  const local = (email ?? "").split("@")[0]?.split("+")[0] ?? "";
  // Words are runs of letters; digits and separators split or trail them.
  const words = local.split(/[^\p{L}]+/u).filter(Boolean);
  const first = words[0];
  if (!first || first.length < 2) return null;
  if (ROLE_MAILBOXES.has(first.toLowerCase())) return null;
  return capitalise(first);
}

/** The best first name we can honestly show, or null when there is none. */
export function friendlyFirstName(email: string | null | undefined, displayName?: string | null): string | null {
  return firstNameFromDisplayName(displayName) ?? firstNameFromEmail(email);
}

/** "Hello, Tejas" when a name is known, otherwise "Welcome back". */
export function greetingFor(email: string | null | undefined, displayName?: string | null): string {
  const name = friendlyFirstName(email, displayName);
  return name ? `Hello, ${name}` : "Welcome back";
}
