/**
 * Meta's Graph API answers errors in the connected account's language
 * ("Не удается найти запрошенного пользователя.", "Der gesuchte Nutzer wurde
 * nicht gefunden."), and those strings used to be stored as delivery and
 * execution reasons that owners read. Every call now asks for English
 * (`locale=en_US`), and independently the known error codes map to one stable
 * plain-English reason here. The raw provider message only goes to the logs.
 *
 * Codes: https://developers.facebook.com/docs/graph-api/guides/error-handling
 * and the Instagram Messaging / Private Replies error tables.
 */

export type MetaErrorDetails = {
  status: number;
  code?: number;
  subcode?: number;
  /** Provider text, used only to recognise English messages we have no code for. */
  message?: string;
};

export const META_ERROR_REASONS = {
  userNotFound: "Instagram couldn't find this person. They may have blocked the account or deleted their profile.",
  notMessageable: "This person can't receive messages from the account right now.",
  outsideMessagingWindow: "This person last messaged more than 24 hours ago, so Instagram doesn't allow an automated message.",
  privateReplyWindow: "Instagram only allows a private reply within 7 days of the comment.",
  privateReplyUsed: "This comment already has a private reply. Instagram allows only one.",
  objectMissing: "The comment or post no longer exists, or it was hidden or made private.",
  permissionMissing: "Linkar is missing an Instagram permission for this. Reconnect the account in Settings to grant it.",
  tokenExpired: "The Instagram connection expired. Reconnect the account in Settings.",
  rateLimited: "Instagram is limiting how fast messages can go out right now. It will be retried.",
  temporary: "Instagram had a temporary problem. It will be retried.",
  policyBlocked: "Instagram has temporarily blocked this account from sending messages.",
} as const;

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80002, 80006]);
const TEMPORARY_CODES = new Set([1, 2]);
/** Subcodes Meta uses for "outside the allowed messaging window". */
const WINDOW_SUBCODES = new Set([2018278, 2534022]);
const USER_NOT_FOUND_SUBCODES = new Set([2018001, 2534014]);

export function describeMetaError({ status, code, subcode, message = "" }: MetaErrorDetails): string {
  if (code === 190 || status === 401) return META_ERROR_REASONS.tokenExpired;
  if (code !== undefined && RATE_LIMIT_CODES.has(code)) return META_ERROR_REASONS.rateLimited;
  if (status === 429) return META_ERROR_REASONS.rateLimited;
  if (subcode !== undefined && WINDOW_SUBCODES.has(subcode)) return META_ERROR_REASONS.outsideMessagingWindow;
  if (subcode !== undefined && USER_NOT_FOUND_SUBCODES.has(subcode)) return META_ERROR_REASONS.userNotFound;
  if (code === 551) return META_ERROR_REASONS.notMessageable;
  if (code === 368) return META_ERROR_REASONS.policyBlocked;
  // Messages without a dedicated code are only matched in English, which every
  // request now asks for.
  if (/private repl/i.test(message) && /(7|seven)[ -]day|expired|too old/i.test(message)) {
    return META_ERROR_REASONS.privateReplyWindow;
  }
  if (/private repl/i.test(message) && /already|only one/i.test(message)) return META_ERROR_REASONS.privateReplyUsed;
  if (/outside of allowed window/i.test(message)) return META_ERROR_REASONS.outsideMessagingWindow;
  if (code === 100 && subcode === 33) return META_ERROR_REASONS.objectMissing;
  if (/does not exist|cannot be loaded|no longer available/i.test(message)) return META_ERROR_REASONS.objectMissing;
  if (/no matching user|user.*(not found|cannot be found)/i.test(message)) return META_ERROR_REASONS.userNotFound;
  if (code === 3 || code === 10 || (code !== undefined && code >= 200 && code <= 299) || status === 403) {
    return META_ERROR_REASONS.permissionMissing;
  }
  if (code !== undefined && TEMPORARY_CODES.has(code)) return META_ERROR_REASONS.temporary;
  if (status >= 500) return META_ERROR_REASONS.temporary;
  if (code !== undefined) {
    return `Instagram rejected the request (error ${code}${subcode !== undefined ? `/${subcode}` : ""}).`;
  }
  return `Instagram rejected the request (HTTP ${status}).`;
}
