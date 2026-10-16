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
  accountBlocked: "Instagram has limited this account, so it can't send messages right now.",
} as const;

/**
 * Graph codes Meta uses to throttle an app or an account. Exported so the send
 * path can treat them as a request to slow down, not as a plain failure.
 */
export const META_RATE_LIMIT_CODES: ReadonlySet<number> = new Set([4, 17, 32, 613, 80002, 80006]);
const RATE_LIMIT_CODES = META_RATE_LIMIT_CODES;
/**
 * Account-level sending blocks. 368 is Meta's "temporarily blocked for policy
 * reasons"; #2022 is "The business has been blocked from sending messages via
 * the IG Messaging API", which Meta returns as the code, as the subcode, or
 * only inside the message text depending on the endpoint.
 */
const ACCOUNT_BLOCK_CODES = new Set([368, 2022]);
const ACCOUNT_BLOCK_MESSAGE = /\(#(?:368|2022)\)|blocked from sending messages|deemed abusive or is otherwise disallowed/i;
const TEMPORARY_CODES = new Set([1, 2]);
/** Subcodes Meta uses for "outside the allowed messaging window". */
const WINDOW_SUBCODES = new Set([2018278, 2534022]);
const USER_NOT_FOUND_SUBCODES = new Set([2018001, 2534014]);

export type MetaErrorClass = "account_blocked" | "rate_limited" | "token_expired" | "other";

/**
 * Meta has blocked the whole account (or Page) from sending, as opposed to
 * rejecting one message. Also recognises the stable reason describeMetaError
 * stores, because MetaApiError keeps that instead of Meta's own wording.
 */
export function isMetaAccountBlock({ code, subcode, message = "" }: Omit<MetaErrorDetails, "status"> & { status?: number }): boolean {
  if (code !== undefined && ACCOUNT_BLOCK_CODES.has(code)) return true;
  if (subcode !== undefined && ACCOUNT_BLOCK_CODES.has(subcode)) return true;
  return ACCOUNT_BLOCK_MESSAGE.test(message) || message === META_ERROR_REASONS.accountBlocked;
}

/** Meta asked the app or the account to slow down (Graph throttling codes, or HTTP 429). */
export function isMetaRateLimit({ status, code }: Pick<MetaErrorDetails, "status" | "code">): boolean {
  return (code !== undefined && RATE_LIMIT_CODES.has(code)) || status === 429;
}

/** The few error classes the send path acts on; everything else is an ordinary rejection. */
export function classifyMetaError(details: MetaErrorDetails): MetaErrorClass {
  if (details.code === 190 || details.status === 401) return "token_expired";
  if (isMetaAccountBlock(details)) return "account_blocked";
  if (isMetaRateLimit(details)) return "rate_limited";
  return "other";
}

export function describeMetaError({ status, code, subcode, message = "" }: MetaErrorDetails): string {
  if (code === 190 || status === 401) return META_ERROR_REASONS.tokenExpired;
  // Before the throttling and permission checks: Meta sometimes sends #2022
  // with a permission-style code or a 403, and it must not read as either.
  if (isMetaAccountBlock({ code, subcode, message })) return META_ERROR_REASONS.accountBlocked;
  if (code !== undefined && RATE_LIMIT_CODES.has(code)) return META_ERROR_REASONS.rateLimited;
  if (status === 429) return META_ERROR_REASONS.rateLimited;
  if (subcode !== undefined && WINDOW_SUBCODES.has(subcode)) return META_ERROR_REASONS.outsideMessagingWindow;
  if (subcode !== undefined && USER_NOT_FOUND_SUBCODES.has(subcode)) return META_ERROR_REASONS.userNotFound;
  if (code === 551) return META_ERROR_REASONS.notMessageable;
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

/*
 * Linkar's own reasons for a send it held back after Meta limited the account.
 * They live here, beside Meta's reasons, because Home reads them from the
 * delivery history in the browser and this module has no server imports.
 */

export type AccountPausePlatform = "Instagram" | "Facebook";

function pausedThing(platform: AccountPausePlatform): string {
  return platform === "Facebook" ? "Page" : "account";
}

const MINUTE_MS = 60_000;

/** Rounded up to the minute, so a restart time read back is never early. */
function wholeMinutes(durationMs: number): number {
  return Number.isFinite(durationMs) ? Math.max(1, Math.ceil(durationMs / MINUTE_MS)) : 1;
}

function durationLabel(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourText = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const minuteText = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  if (hours === 0) return minuteText;
  if (minutes === 0) return hourText;
  return `${hourText} and ${minuteText}`;
}

const DURATION = "(\\d+ hours?(?: and \\d+ minutes?)?|\\d+ minutes?)";
const ACCOUNT_PAUSED_PATTERN = new RegExp(`^(Instagram|Facebook) has limited this (?:account|Page)\\. Linkar paused automatic replies on it for ${DURATION}\\.$`);
const ACCOUNT_HELD_PATTERN = new RegExp(`^Not sent\\. (Instagram|Facebook) has limited this (?:account|Page), so Linkar paused sending from it for another ${DURATION}\\.$`);

function parseDurationMs(text: string): number {
  const hours = Number(/(\d+) hour/.exec(text)?.[1] ?? 0);
  const minutes = Number(/(\d+) minute/.exec(text)?.[1] ?? 0);
  return (hours * 60 + minutes) * MINUTE_MS;
}

/**
 * Stored on the send Meta blocked: it starts the pause, and Home reads the
 * length back. To the minute, so the restart time Home shows is exact.
 */
export function accountPausedReason(durationMs: number, platform: AccountPausePlatform = "Instagram"): string {
  return `${platform} has limited this ${pausedThing(platform)}. Linkar paused automatic replies on it for ${durationLabel(wholeMinutes(durationMs))}.`;
}

/**
 * Stored on each send Linkar held back during the pause, with the time still
 * left, so Home can tell when replies restart from any recent record, not only
 * from the one Meta refused.
 */
export function accountSendHeldReason(remainingMs: number, platform: AccountPausePlatform = "Instagram"): string {
  return `Not sent. ${platform} has limited this ${pausedThing(platform)}, so Linkar paused sending from it for another ${durationLabel(wholeMinutes(remainingMs))}.`;
}

/** Reads back either reason above: which platform paused, and for how long from that record. */
export function parseAccountPauseReason(text: string | undefined): { platform: AccountPausePlatform; durationMs: number } | null {
  if (!text) return null;
  const match = ACCOUNT_PAUSED_PATTERN.exec(text) ?? ACCOUNT_HELD_PATTERN.exec(text);
  return match ? { platform: match[1] as AccountPausePlatform, durationMs: parseDurationMs(match[2]) } : null;
}

/** A send waiting out a short cool-down after Meta asked Linkar to slow down. */
export const ACCOUNT_THROTTLED_REASON = "Instagram asked Linkar to slow down, so messages from this account are waiting a few minutes.";
/** A send held back by the reduced hourly budget that follows a pause. */
export const ACCOUNT_RECOVERING_REASON = "Linkar is sending slowly from this account while it recovers from an Instagram limit.";

export type MetaUsage = {
  /** Highest usage share Meta reported across its counters, 0 to 100 or more. */
  highestPercent: number;
  /** Meta's own estimate of when throttling lifts; 0 when it gave none. */
  regainAccessMs: number;
};

function usageNumbers(value: unknown): { percent: number; regainMinutes: number } {
  if (typeof value !== "object" || value === null) return { percent: 0, regainMinutes: 0 };
  const record = value as Record<string, unknown>;
  const numeric = (key: string) => (typeof record[key] === "number" && Number.isFinite(record[key]) ? record[key] as number : 0);
  return {
    percent: Math.max(numeric("call_count"), numeric("total_cputime"), numeric("total_time")),
    regainMinutes: numeric("estimated_time_to_regain_access"),
  };
}

/**
 * Reads Meta's usage headers (X-App-Usage and X-Business-Use-Case-Usage) from
 * a response the client already has. Returns null when neither is present or
 * readable, so a missing header never changes behaviour.
 */
export function parseMetaUsageHeaders(headers: { get(name: string): string | null }): MetaUsage | null {
  const readings: Array<{ percent: number; regainMinutes: number }> = [];
  const parse = (name: string): unknown => {
    const raw = headers.get(name);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  };
  const app = parse("x-app-usage");
  if (app !== undefined) readings.push(usageNumbers(app));
  const business = parse("x-business-use-case-usage");
  if (typeof business === "object" && business !== null) {
    for (const entries of Object.values(business as Record<string, unknown>)) {
      if (Array.isArray(entries)) readings.push(...entries.map(usageNumbers));
    }
  }
  if (readings.length === 0) return null;
  return {
    highestPercent: Math.max(...readings.map((reading) => reading.percent)),
    regainAccessMs: Math.max(...readings.map((reading) => reading.regainMinutes)) * 60_000,
  };
}
