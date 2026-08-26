/**
 * Meta's Graph API returns error messages localized to the connected
 * account's language, so raw `lastError` strings can land in the failure
 * feed in any language (observed: Russian) with no English explanation.
 * This maps the handful of messages we've actually seen to a stable
 * English sentence, and falls back to a generic one for anything else
 * written in a non-Latin script - the raw string is always preserved
 * alongside it for support/debugging.
 */

const KNOWN_PATTERNS: Array<{ match: RegExp; text: string }> = [
  {
    match: /не удается найти запрошенного пользователя/i,
    text: "Meta couldn't find that Instagram user - they may have blocked the account, deleted it, or the ID has expired.",
  },
  {
    match: /unsupported post request.*does not exist/i,
    text: "Meta says the linked post is no longer available (deleted, made private, or missing permission to read it).",
  },
];

const NON_LATIN_SCRIPT = /[Ѐ-ӿͰ-Ͽ一-鿿぀-ヿ가-힯֐-׿؀-ۿ]/;

export type HumanizedProviderError = {
  /** English sentence to show as the primary message. */
  text: string;
  /** True when `text` differs from the raw provider message. */
  translated: boolean;
  /** The untouched string from the provider, always available for detail/support use. */
  raw: string;
};

export function humanizeProviderError(raw: string): HumanizedProviderError {
  const trimmed = raw.trim();
  for (const { match, text } of KNOWN_PATTERNS) {
    if (match.test(trimmed)) return { text, translated: true, raw: trimmed };
  }
  if (NON_LATIN_SCRIPT.test(trimmed)) {
    return {
      text: "Meta rejected this delivery and returned an error message in another language.",
      translated: true,
      raw: trimmed,
    };
  }
  return { text: trimmed, translated: false, raw: trimmed };
}
