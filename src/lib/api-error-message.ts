/**
 * Turns an API route's error code into a sentence for the screen. Lives apart
 * from ./validation-error, which imports zod, because every workspace screen
 * calls it in the browser.
 */
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
