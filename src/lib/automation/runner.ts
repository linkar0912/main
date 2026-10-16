import { evaluateFlow } from "./engine";
import type { EvaluationContext, ExecutionAction, NormalizedEvent } from "./types";
import { unsealSecret } from "../security/secrets";
import type {
  AutomationContactRecord,
  AutomationParticipantRecord,
  AutomationRecord,
  AutomationRepository,
  InstagramConnectionRecord,
  OutboundDeliveryRecord,
  RecordExecutionInput,
  WorkspaceStatus,
} from "../repository";
import { MetaApiError } from "../meta/client";
import type { MetaConnection, MetaMessage } from "../meta/types";
import { notifyWorkspaceManagers } from "../notifications";
import type { OutboundEmail } from "../mailer";
import { logger } from "../logger";
import { enqueueLeadDelivery, enqueueFlowFollowUps, type FlowFollowUpJob, type LeadDeliveryJob } from "../queue";
import {
  releaseDailySendSlots,
  reserveDailySendSlots,
  renderTemplate,
  type SendLimitReservation,
} from "./send-limits";
import { checkSendRateLimit } from "./send-rate-limiter";
import { findSendDeferral, SendDeferredError } from "./send-deferral";
import {
  processCampaignEvent,
  processExistingCampaignParticipant,
  processPendingCampaignInteraction,
  type CampaignRunnerClient,
  type CampaignRunnerOptions,
  type CampaignRunnerResult,
} from "./campaign-runner";
import {
  deliveryKeys,
  executeOutboundDelivery,
  prefetchDeliveryEntitlements,
  type DeliveryExecutionResult,
} from "./outbound-delivery";
import { processLeadDelivery } from "./lead-delivery";
import { contactAutomationsPaused } from "./manual-reply";
import { underlyingRepository, type DeliveryTimingObserver } from "./delivery-timing";

export type AutomationRunnerClient = CampaignRunnerClient;

export type RunnerOptions = CampaignRunnerOptions & {
  campaignsEnabled?: boolean;
  /** When the webhook reached Linkar (epoch ms); recorded on the activity row. */
  receivedAt?: number;
};

export type RunnerResult = {
  matched: number;
  sent: number;
  skipped: number;
  failed: number;
};

export class RetryableAutomationError extends Error {
  readonly retryable = true;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RetryableAutomationError";
  }
}

export function isRetryableAutomationError(error: unknown): error is RetryableAutomationError {
  return error instanceof RetryableAutomationError;
}

function retryableAutomationError(error: unknown): RetryableAutomationError {
  if (isRetryableAutomationError(error)) return error;
  return new RetryableAutomationError(
    error instanceof Error ? error.message : String(error),
    { cause: error },
  );
}

function metaConnection(connection: InstagramConnectionRecord, tokenEncryptionKey: string): MetaConnection {
  return {
    igUserId: connection.igUserId,
    accessToken: unsealSecret(connection.accessTokenEncrypted, tokenEncryptionKey),
  };
}

async function sendAction(
  client: AutomationRunnerClient,
  connection: MetaConnection,
  action: ExecutionAction,
): Promise<string | undefined> {
  if (action.type === "private_reply") {
    return (await client.sendPrivateReply(connection, action.commentId, action.text)).message_id;
  }

  if (action.type === "quick_replies") {
    return sendQuickRepliesAction(client, connection, action);
  }

  const message: MetaMessage =
    action.type === "send_text"
      ? { type: "text", text: action.text }
      : action.type === "send_link"
        ? { type: "link", text: action.text, url: action.url }
        : action.type === "send_image"
          ? { type: "image", imageUrl: action.imageUrl }
          : { type: "button", text: action.text, buttonLabel: action.buttonLabel, url: action.url };

  return (await client.sendDirectMessage(connection, action.recipientId, message)).message_id;
}

/** Sends one DM carrying tappable quick-reply chips (up to four). */
async function sendQuickRepliesAction(
  client: AutomationRunnerClient,
  connection: MetaConnection,
  action: Extract<ExecutionAction, { type: "quick_replies" }>,
): Promise<string | undefined> {
  if (!client.sendQuickReplies) {
    throw new Error("Meta client does not support quick replies");
  }
  return (await client.sendQuickReplies(connection, action.recipientId, action.text, action.replies)).message_id;
}

/**
 * Personalization variables for one inbound event. {username} comes from the
 * comment webhook when Meta provides it; DM-side events have no handle, so it
 * degrades to "there". {keyword} is only set for keyword triggers that matched,
 * and {media} only when the event carries a post - undefined variables leave
 * their token untouched rather than sending a broken sentence.
 */
function buildTemplateVars(event: NormalizedEvent, matchedKeyword?: string): Record<string, string | undefined> {
  return {
    username: event.senderUsername ?? "there",
    ...(matchedKeyword ? { keyword: matchedKeyword } : {}),
    ...(event.mediaId ? { media: "your post" } : {}),
  };
}

/** Renders personalization tokens across every text field of an outgoing action. */
function personalizeAction(action: ExecutionAction, vars: Record<string, string | undefined>): ExecutionAction {
  switch (action.type) {
    case "private_reply":
    case "send_text":
      return { ...action, text: renderTemplate(action.text, vars) };
    case "send_link":
      return { ...action, text: renderTemplate(action.text, vars) };
    case "send_button":
      return {
        ...action,
        text: renderTemplate(action.text, vars),
        buttonLabel: renderTemplate(action.buttonLabel, vars),
      };
    case "send_image":
      return action;
    case "quick_replies":
      return {
        ...action,
        text: renderTemplate(action.text, vars),
        replies: action.replies.map((reply) => renderTemplate(reply, vars)),
      };
  }
}

const DEFAULT_DELIVERY_CLAIM_LEASE_MS = 30_000;
const DAILY_LIMIT_ERROR = "daily_send_limit_reached";

/**
 * Meta only accepts a private reply within 7 days of the comment it answers
 * (docs: Instagram Platform > Private Replies). Past that the Graph call is
 * rejected outright, so attempting it burns retry budget and adds a failed
 * send against the account for no possible benefit. Webhooks are normally
 * near-real-time, but a drained queue backlog, a long outage, or an admin
 * replay can all surface a comment far older than that.
 */
const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
// Stored as the execution reason, which owners read in Activity.
const PRIVATE_REPLY_EXPIRED_ERROR = "Instagram only allows a private reply within 7 days of the comment";

class DailySendLimitError extends Error {
  constructor() {
    super(DAILY_LIMIT_ERROR);
    this.name = "DailySendLimitError";
  }
}

async function executeActionDelivery(
  repository: AutomationRepository,
  request: {
    deliveryKey: string;
    workspaceId: string;
    automationId: string;
    instagramAccountId: string;
    recipientId?: string;
    kind: "CLASSIC_ACTION" | "EMAIL_CAPTURE";
    action: ExecutionAction;
    claimLeaseMs: number;
    dailySendLimit?: number;
    timingObserver?: DeliveryTimingObserver;
    /** Timestamp of the event that triggered this action; gates private replies. */
    sourceEventTimestamp?: number;
    /** The ledger row, when the caller already started reading it. */
    existingDelivery?: Promise<Settled<OutboundDeliveryRecord | null>>;
  },
  client: AutomationRunnerClient,
  connection: MetaConnection,
): Promise<DeliveryExecutionResult> {
  const existing = request.existingDelivery
    ? unwrap(await request.existingDelivery)
    : await repository.getOutboundDelivery(request.deliveryKey);
  const needsProviderAttempt = !existing
    || existing.state === "PENDING"
    || (existing.state === "FAILED" && existing.retryable);
  let reservation: SendLimitReservation | undefined;
  if (needsProviderAttempt) {
    reservation = await reserveDailySendSlots({
      repository,
      automationId: request.automationId,
      workspaceId: request.workspaceId,
      limit: request.dailySendLimit,
    }, 1);
    if (!reservation.allowed) {
      return { status: "FAILED", retryable: false, error: DAILY_LIMIT_ERROR };
    }
  }

  try {
    // Comments-to-private-reply is the one Meta limit we have confirmed from
    // primary docs (750/hour per Instagram account). Checked here, before the
    // provider call, so a burst never spends its 3 retry attempts against a
    // ceiling we already know it will hit - see send-rate-limiter.ts.
    if (needsProviderAttempt && request.action.type === "private_reply") {
      // Terminal, not retryable: the window only ever gets further past due.
      if (
        request.sourceEventTimestamp !== undefined
        && Date.now() - request.sourceEventTimestamp > PRIVATE_REPLY_WINDOW_MS
      ) {
        await releaseDailySendSlots({ repository, automationId: request.automationId }, reservation!);
        return { status: "FAILED", retryable: false, error: PRIVATE_REPLY_EXPIRED_ERROR };
      }
      const rateLimit = await checkSendRateLimit(connection.igUserId, "private_reply");
      if (!rateLimit.allowed) {
        await releaseDailySendSlots({ repository, automationId: request.automationId }, reservation!);
        reservation = undefined;
        // Deferred until the window resets - the job is parked, not failed,
        // and the 7-day reply window is far longer than one rate window.
        throw new SendDeferredError("Send rate limit reached for this Instagram account", rateLimit.retryAfterMs);
      }
    } else if (needsProviderAttempt) {
      // Non-private-reply actions share the account's DM budget; a known ceiling
      // must not burn retry attempts either.
      const rateLimit = await checkSendRateLimit(connection.igUserId, "direct_message");
      if (!rateLimit.allowed) {
        await releaseDailySendSlots({ repository, automationId: request.automationId }, reservation!);
        reservation = undefined;
        throw new SendDeferredError("Send rate limit reached for this Instagram account", rateLimit.retryAfterMs);
      }
    }

    const result = await executeOutboundDelivery({
      deliveryKey: request.deliveryKey,
      workspaceId: request.workspaceId,
      automationId: request.automationId,
      instagramAccountId: request.instagramAccountId,
      recipientId: request.recipientId,
      kind: request.kind,
      payload: { ...request.action },
      claimLeaseMs: request.claimLeaseMs,
      repository,
      timingObserver: request.timingObserver,
    }, async (payload) => ({
      id: await sendAction(client, connection, payload as ExecutionAction),
    }));
    if (
      reservation
      && (result.status === "FAILED" || result.status === "BUSY"
        || (result.status === "SENT" && result.reused))
    ) {
      await releaseDailySendSlots({ repository, automationId: request.automationId }, reservation);
    }
    return result;
  } catch (error) {
    if (reservation) {
      await releaseDailySendSlots({ repository, automationId: request.automationId }, reservation);
    }
    throw error;
  }
}

function requireSentDelivery(
  result: DeliveryExecutionResult,
  finalAttempt: boolean | undefined,
): string | undefined {
  if (result.status === "SENT") {
    // SENT with no providerMessageId is unusual: the outbound ledger only
    // returns a message id when Meta actually replied with one. Replays of
    // a previously-sent delivery (SENT + reused) may not have a fresh id
    // because the original send happened earlier. Surface this as a warning
    // so an operator can correlate it with the deliverability metrics.
    if (!result.providerMessageId) {
      logger.warn("delivery SENT without a provider message id", {
        reused: result.reused,
      });
    }
    return result.providerMessageId;
  }
  if (result.status === "FAILED" && result.error === DAILY_LIMIT_ERROR) {
    throw new DailySendLimitError();
  }
  if (result.status === "BUSY") {
    throw new MetaApiError("Outbound delivery is already in progress", 503, true);
  }
  if (result.status === "FAILED" && result.retryable && !finalAttempt) {
    throw new MetaApiError(result.error, 503, true);
  }
  throw new Error(result.error);
}

/** A DM flow with no keyword: the account's default reply / fallback. */
function isDefaultReplyFlow(automation: AutomationRecord): boolean {
  const definition = automation.definition;
  return definition.version === 1
    && definition.trigger.type === "message"
    && definition.trigger.match === "any"
    && definition.conditions.length === 0;
}

/** Inbound events that represent a person reaching out on the DM side of the account. */
const CONTACT_TOUCH_EVENT_TYPES: NormalizedEvent["type"][] = [
  "message.received",
  "quick_reply.received",
  "postback.received",
  "optin.received",
  "referral.received",
  "story_mention.received",
];

/**
 * Invalid email replies tolerated before the collector stops asking: one prompt plus
 * this many retries keeps the exchange polite without looping forever.
 */
const MAX_EMAIL_CAPTURE_RETRIES = 2;

/** Pragmatic email shape: local@domain.tld, extracted out of freeform DM text. */
export function extractEmailAddress(text: string): string | undefined {
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
  if (!match || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(match)) return undefined;
  return match.toLowerCase();
}

/**
 * Pragmatic phone shape for conversational forms: keeps a leading + and digits,
 * tolerating spaces/dashes. 7-15 digits covers local Indian numbers through E.164.
 */
export function extractPhoneNumber(text: string): string | undefined {
  const trimmed = text.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) return undefined;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/** Validates one typed capture-field answer; returns the stored form or undefined when invalid. */
export function validateFieldAnswer(
  answer: string,
  kind: "text" | "email" | "phone" | "number" | undefined,
): string | undefined {
  switch (kind) {
    case "email":
      return extractEmailAddress(answer);
    case "phone":
      return extractPhoneNumber(answer);
    case "number":
      return /^\d{1,15}(\.\d{1,4})?$/.test(answer.trim()) ? answer.trim() : undefined;
    default:
      // Plain-text questions accept anything - even a blank reply is stored
      // rather than bounced, so an accidental Enter never traps the person.
      return answer.trim();
  }
}

/**
 * Opt-out recognition. The WHOLE message must be an opt-out request: "Stop!",
 * " STOP. ", "please stop", "band karo" and "मैसेज मत भेजो" all count, while
 * "where is the bus stop" or "dukaan kab band hoti hai" stay normal messages.
 * Suppression is permanent (only an owner can lift it), so every phrase below
 * is a clear request to stop messaging; vague replies such as "no", "cancel",
 * "not interested" or "stop it" are deliberately left out.
 *
 * Matching ignores case, Unicode width, punctuation, apostrophes and spacing,
 * and tolerates polite words on either side ("please", "now", "ji").
 *
 * Emoji only matter for the few short forms people also use as a joke: a bare
 * "stop", "band karo", "mat bhejo" or "roko", "bas karo" with a messages word,
 * "leave me alone", "don't bother me" and "pareshan mat karo". On those, a
 * laughing, winking or tongue face, a heart or kiss, a skull or 😭 (or a text
 * face such as ";)", ":P" or "^_^") means the person is joking, so "stop 😂"
 * and "bas karo bhai 😂" stay normal messages. Every other emoji, including smiles (🙂, 😊, ":)"), thumbs up, ticks,
 * warning signs and annoyed or angry faces (😤, 🙄, 😡, 💢), fits a sincere
 * request. Phrases that can only mean opt-out ("unsubscribe", "stop messaging
 * me", "remove me from your list", "मैसेज मत भेजो") count whatever the emoji.
 *
 * A question mark only cancels forms that really can be questions: "no more
 * messages?" and any Hindi phrase ("band karo?", "mat bhejo?"), since Hindi
 * marks a yes or no question by the "?" alone. English requests such as
 * "Please stop???" or "stop messaging me?!" still count.
 */
const OPT_OUT_MAX_LENGTH = 200;
const APOSTROPHES = /['‘’ʼ`´]/gu;
/** Zero-width joiners and other format characters, plus emoji variation selectors and keycaps. */
const INVISIBLE_CHARACTERS = /[\p{Cf}\u{fe00}-\u{fe0f}\u{20e3}\u{e0100}-\u{e01ef}]/gu;
const NON_WORD_CHARACTERS = /[^\p{L}\p{N}\p{M}]+/gu;
const EMOJI = /\p{Extended_Pictographic}/gu;
/**
 * Emoji that read as a joke on the forms that can be one. Skin tones, variation
 * selectors and joiners are not pictographs, so "❤️" and "🙈🏽" match too.
 */
const PLAYFUL_EMOJI = new Set([
  // Laughing and grinning faces
  "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😹", "😸", "🤭",
  // Winking, tongue and teasing faces
  "😉", "😜", "😝", "😛", "🤪", "😋", "😏", "🙃", "🙈",
  // Hearts and kisses
  "😍", "🥰", "😘", "😗", "😙", "😚", "😻", "😽", "💋", "🫶",
  "❤", "♥", "🧡", "💛", "💚", "💙", "💜", "🤎", "🖤", "🤍", "🩷", "🩵", "🩶",
  "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "❣",
  // Skulls ("I'm dead") and loud crying, both mostly used for laughing
  "💀", "☠", "😭",
]);
/**
 * Winking, laughing or tongue text faces such as ";)", ";-)", ":D", ":P" and
 * "^_^". A plain ":)" is a polite smile, like 🙂, so it does not count.
 */
const PLAYFUL_TEXT_FACE = /;['’-]?[)\]}]|[;:=]['’-]?[dDpP3](?![\p{L}\p{N}])|\^_*\^/u;

function hasPlayfulTone(text: string): boolean {
  if (PLAYFUL_TEXT_FACE.test(text)) return true;
  for (const [emoji] of text.matchAll(EMOJI)) {
    if (PLAYFUL_EMOJI.has(emoji)) return true;
  }
  return false;
}

function normalizeOptOutText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(INVISIBLE_CHARACTERS, "")
    .replace(APOSTROPHES, "")
    .replace(NON_WORD_CHARACTERS, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One required word slot: any of the options. */
function anyOf(options: readonly string[]): string {
  return `(?:${options.map((option) => escapeRegExp(normalizeOptOutText(option))).join("|")})`;
}

/** One optional word slot, consuming its trailing space when present. */
function maybe(options: readonly string[]): string {
  return `(?:${anyOf(options)} )?`;
}

type OptOutPhrase = {
  pattern: RegExp;
  /** Also used as a joke, so a playful emoji or text face cancels it. */
  canBeJoke: boolean;
  /** Can be a genuine question, so any "?" cancels it. */
  canBeQuestion: boolean;
};

/** A request that can only mean opt-out: no emoji or "?" cancels it. */
function request(source: string): OptOutPhrase {
  return { pattern: wholeMessage(source), canBeJoke: false, canBeQuestion: false };
}

/** A short form people also say as a joke ("stop 😂", "leave me alone 😂"). */
function jokeable(source: string): OptOutPhrase {
  return { pattern: wholeMessage(source), canBeJoke: true, canBeQuestion: false };
}

/** A form that is also a question when it ends in "?" ("band karo?", "no more messages?"). */
function askable(source: string): OptOutPhrase {
  return { pattern: wholeMessage(source), canBeJoke: false, canBeQuestion: true };
}

/** A short form that can be both a joke and a question ("band karo", "mat bhejo"). */
function jokeableAskable(source: string): OptOutPhrase {
  return { pattern: wholeMessage(source), canBeJoke: true, canBeQuestion: true };
}

function wholeMessage(source: string): RegExp {
  return new RegExp(`^${source}$`, "u");
}

// English
const EN_MESSAGES = ["messages", "message", "msgs", "msg", "dms", "dm", "texts", "notifications", "spam"];
const EN_QUANTIFIER = ["the", "these", "this", "those", "all", "all the", "all these", "your", "any", "any more", "anymore", "more", "such", "automated"];
const EN_CONTACT_VERBS = ["message", "msg", "text", "dm", "contact", "spam", "ping"];
const EN_AGAIN = ["again", "anymore", "any more", "ever again"];

// Hindi in Latin script (Hinglish)
const HI_ME = ["mujhe", "mujhko", "muje", "mujhe ab", "hume", "humein", "hamein"];
const HI_THIS = ["ye", "yeh", "aur", "dobara", "dubara", "phir se", "fir se", "koi", "sab", "saare", "sare", "aise"];
const HI_MESSAGES = ["message", "messages", "msg", "msgs", "mssg", "mesage", "messege", "sms", "dm", "dms", "text", "texts", "spam", "messaging", "spamming"];
const HI_STOP = ["band", "bandh", "bnd", "stop"];
const HI_DO = ["karo", "kro", "kar do", "kardo", "kr do", "krdo", "kar dijiye", "kar dijie", "kijiye", "kijie", "kariye", "kare", "karen", "karein", "kar den", "kar dein", "kar dena"];
const HI_DONT_DO = ["karo", "kro", "karna", "krna", "kariye", "kijiye", "kijie", "kare", "karen", "karein", "kariyega"];
const HI_NOT = ["mat", "matt", "mt", "na"];
const HI_SEND = ["bhejo", "bhjo", "bhejna", "bhejiye", "bhejie", "bheje", "bhejen", "bhejein", "bhejiyega"];
const HI_FROM_LIST = ["list se", "yahan se", "yaha se"];
const HI_REMOVE = ["hatao", "htao", "hata do", "hta do", "hata dijiye", "hataiye", "hata dena", "nikalo", "nikal do"];
const HI_NOT_WANTED = ["nahi chahiye", "nahin chahiye", "nai chahiye", "nhi chahiye", "nahi chaiye", "nhi chaiye"];
const HI_BOTHER = ["pareshan", "pareshaan", "preshan", "tang", "tung", "disturb", "irritate", "bother"];
const HI_HALT = ["roko", "rok do", "rok dijiye", "rokiye", "rok dena"];

// Hindi in Devanagari
const DV_ME = ["मुझे", "मुझको", "हमें", "हमे"];
const DV_THIS = ["ये", "यह", "और", "दोबारा", "फिर से", "कोई", "सब", "सारे", "ऐसे"];
const DV_MESSAGES = ["मैसेज", "मेसेज", "मैसेजेस", "मेसेजेस", "मैसेजस", "संदेश", "एसएमएस"];
const DV_STOP = ["बंद", "बन्द", "स्टॉप", "स्टाप"];
const DV_DO = ["करो", "करें", "करे", "करिए", "करिये", "कीजिए", "कीजिये", "कर दो", "करदो", "कर दें", "कर दीजिए", "कर दीजिये", "कर देना"];
const DV_DONT_DO = ["करो", "करें", "करे", "करिए", "करिये", "कीजिए", "कीजिये", "करना"];
const DV_NOT = ["मत", "न", "ना"];
const DV_SEND = ["भेजो", "भेजें", "भेजे", "भेजिए", "भेजिये", "भेजना"];
const DV_FROM_LIST = ["लिस्ट से", "सूची से", "यहाँ से", "यहां से"];
const DV_REMOVE = ["हटाओ", "हटा दो", "हटा दीजिए", "हटा दीजिये", "हटाइए", "हटाइये", "निकालो", "निकाल दो"];
const DV_NOT_WANTED = ["नहीं चाहिए", "नहीं चाहिये", "नही चाहिए", "नही चाहिये"];
const DV_BOTHER = ["परेशान", "तंग", "डिस्टर्ब"];
const DV_HALT = ["रोको", "रोक दो", "रोक दीजिए", "रोकिए", "रोकिये"];
const DV_UNSUBSCRIBE = ["अनसब्सक्राइब", "अनसबस्क्राइब"];

const OPT_OUT_PHRASES: readonly OptOutPhrase[] = [
  // English keywords and short forms: "STOP", "stop stop", "STOP ALL". "stop
  // it", "stop that" and "stop this" are left out: on a story they are banter.
  jokeable(`stop(?: stop)*(?: all)?`),
  jokeable(`stopall`),
  jokeable(`leave me alone`),
  jokeable(`stop bothering(?: me)?`),
  jokeable(`${anyOf(["dont", "do not", "never"])} bother me(?: ${anyOf(EN_AGAIN)})?`),
  // English requests that can only mean opt-out
  request(`stop ${anyOf(["messaging", "msging", "texting", "dming", "spamming", "contacting", "pinging", "sending"])}(?: me)?`),
  request(`stop sending(?: me)? ${maybe(EN_QUANTIFIER)}${anyOf([...EN_MESSAGES, "stuff", "anything", "this", "these"])}`),
  request(`stop ${maybe(EN_QUANTIFIER)}${anyOf(EN_MESSAGES)}`),
  request(`${anyOf(["unsubscribe", "unsub"])}(?: me)?`),
  request(anyOf(["opt out", "optout", "opt me out"])),
  request(`${anyOf(["i want to", "i would like to", "id like to", "i wanna", "i wish to", "let me"])} ${anyOf(["unsubscribe", "opt out"])}`),
  request(`remove me(?: from ${anyOf(["your", "the", "this", "all", "my"])} ${anyOf(["list", "lists", "mailing list"])}| from ${anyOf(["here", "this"])})?`),
  request(`take me off ${anyOf(["your", "the", "this"])} list`),
  request(`${anyOf(["dont", "do not", "never"])} ${anyOf(EN_CONTACT_VERBS)} me(?: ${anyOf(EN_AGAIN)})?`),
  request(`${anyOf(["dont", "do not", "never"])} send me ${maybe(EN_QUANTIFIER)}${anyOf([...EN_MESSAGES, "anything", "stuff"])}(?: ${anyOf(EN_AGAIN)})?`),
  request(`i ${anyOf(["dont", "do not"])} want ${maybe(EN_QUANTIFIER)}${anyOf(EN_MESSAGES)}(?: ${anyOf(["anymore", "any more"])})?`),
  // "no more messages?" can also ask whether any are left.
  askable(`no more ${maybe(["of these", "of your", "of the"])}${anyOf(EN_MESSAGES)}`),

  // Hinglish. Every form is askable: Hindi turns a request into a question with
  // the "?" alone. Forms without a messages word can also be a joke.
  // "band karo", "messages band kar do", "message bhejna band karo"
  jokeableAskable(`${maybe(HI_ME)}${maybe(HI_THIS)}${anyOf(HI_STOP)} ${anyOf(HI_DO)}`),
  askable(`${maybe(HI_ME)}${maybe(HI_THIS)}${anyOf(HI_MESSAGES)} ${anyOf(HI_STOP)} ${anyOf(HI_DO)}`),
  askable(`${maybe(HI_ME)}${maybe(HI_THIS)}${maybe(HI_MESSAGES)}bhejna ${anyOf(HI_STOP)} ${anyOf(HI_DO)}`),
  // "mat bhejo", "mujhe message mat bhejo", "message mat karo"
  jokeableAskable(`${maybe(HI_ME)}${maybe(HI_THIS)}${anyOf(HI_NOT)} ${anyOf(HI_SEND)}`),
  askable(`${maybe(HI_ME)}${maybe(HI_THIS)}${anyOf(HI_MESSAGES)} ${anyOf(HI_NOT)} ${anyOf(HI_SEND)}`),
  askable(`${maybe(HI_ME)}${maybe(HI_THIS)}${anyOf(HI_MESSAGES)} ${anyOf(HI_NOT)} ${anyOf(HI_DONT_DO)}`),
  // "mujhe pareshan mat karo"; "bas karo" only with a messages word, since on
  // its own it is just as often a laugh at a joke.
  jokeableAskable(`${maybe(HI_ME)}${anyOf(HI_BOTHER)} ${anyOf(HI_NOT)} ${anyOf(HI_DONT_DO)}`),
  jokeableAskable(`${maybe(HI_ME)}${maybe(HI_THIS)}${anyOf(HI_MESSAGES)} ${anyOf(["bas", "bass"])} ${anyOf(HI_DO)}`),
  // "unsubscribe kar do", "mujhe list se hatao"
  askable(`${maybe(HI_ME)}${anyOf(["unsubscribe", "unsub", "opt out"])} ${anyOf(HI_DO)}`),
  askable(`(?:${anyOf(HI_ME)}(?: ${anyOf(HI_FROM_LIST)})?|${anyOf(HI_FROM_LIST)}) (?:remove ${anyOf(HI_DO)}|${anyOf(HI_REMOVE)})`),
  // "message nahi chahiye", "messages roko"
  askable(`${maybe(HI_ME)}${maybe(HI_THIS)}${anyOf(HI_MESSAGES)} ${anyOf(HI_NOT_WANTED)}`),
  jokeableAskable(`${maybe(HI_THIS)}${anyOf(HI_HALT)}`),
  askable(`${maybe(HI_THIS)}${anyOf(HI_MESSAGES)} ${anyOf(HI_HALT)}`),

  // Devanagari, with the same rules: "बंद करो", "मैसेज भेजना बंद करो", "मुझे मैसेज मत भेजो"
  jokeableAskable(`${maybe(DV_ME)}${maybe(DV_THIS)}${anyOf(DV_STOP)} ${anyOf(DV_DO)}`),
  askable(`${maybe(DV_ME)}${maybe(DV_THIS)}${anyOf(DV_MESSAGES)} ${anyOf(DV_STOP)} ${anyOf(DV_DO)}`),
  askable(`${maybe(DV_ME)}${maybe(DV_THIS)}${maybe(DV_MESSAGES)}भेजना ${anyOf(DV_STOP)} ${anyOf(DV_DO)}`),
  jokeableAskable(`${maybe(DV_ME)}${maybe(DV_THIS)}${anyOf(DV_NOT)} ${anyOf(DV_SEND)}`),
  askable(`${maybe(DV_ME)}${maybe(DV_THIS)}${anyOf(DV_MESSAGES)} ${anyOf(DV_NOT)} ${anyOf(DV_SEND)}`),
  askable(`${maybe(DV_ME)}${maybe(DV_THIS)}${anyOf(DV_MESSAGES)} ${anyOf(DV_NOT)} ${anyOf(DV_DONT_DO)}`),
  jokeableAskable(`${maybe(DV_ME)}${anyOf(DV_BOTHER)} ${anyOf(DV_NOT)} ${anyOf(DV_DONT_DO)}`),
  jokeableAskable(`${maybe(DV_ME)}${maybe(DV_THIS)}${anyOf(DV_MESSAGES)} बस ${anyOf(DV_DO)}`),
  // A bare "अनसब्सक्राइब" is the English keyword written in Devanagari.
  request(anyOf(DV_UNSUBSCRIBE)),
  askable(`${maybe(DV_ME)}${anyOf(DV_UNSUBSCRIBE)} ${anyOf(DV_DO)}`),
  askable(`(?:${anyOf(DV_ME)}(?: ${anyOf(DV_FROM_LIST)})?|${anyOf(DV_FROM_LIST)}) ${anyOf(DV_REMOVE)}`),
  askable(`${maybe(DV_ME)}${maybe(DV_THIS)}${anyOf(DV_MESSAGES)} ${anyOf(DV_NOT_WANTED)}`),
  jokeableAskable(`${maybe(DV_THIS)}${anyOf(DV_HALT)}`),
  askable(`${maybe(DV_THIS)}${anyOf(DV_MESSAGES)} ${anyOf(DV_HALT)}`),
];

const OPT_OUT_LEADING_POLITENESS = new RegExp(`^(?:${anyOf([
  "please", "pls", "plz", "plzz", "plss", "kindly", "kripya", "kripaya", "ab", "bhai", "bhaiya", "sir",
  "कृपया", "प्लीज", "प्लीज़", "अब", "भाई",
])} )+`, "u");
const OPT_OUT_TRAILING_POLITENESS = new RegExp(`(?: ${anyOf([
  "please", "pls", "plz", "plzz", "plss", "now", "already", "thanks", "thank you", "thankyou", "thx", "ty", "sir",
  "ji", "jee", "bhai", "bhaiya", "yaar", "yar", "na", "abhi", "ab",
  "जी", "भाई", "यार", "ना", "अभी", "अब", "प्लीज", "प्लीज़",
])})+$`, "u");

export function isOptOutCommand(text: string): boolean {
  if (!text || text.length > OPT_OUT_MAX_LENGTH) return false;
  const folded = text.normalize("NFKC");
  const normalized = normalizeOptOutText(folded);
  if (!normalized) return false;
  const playful = hasPlayfulTone(folded);
  const question = folded.includes("?");
  const withoutPoliteness = normalized.replace(OPT_OUT_LEADING_POLITENESS, "").replace(OPT_OUT_TRAILING_POLITENESS, "");
  const candidates = withoutPoliteness && withoutPoliteness !== normalized ? [normalized, withoutPoliteness] : [normalized];
  return OPT_OUT_PHRASES.some(
    (phrase) =>
      !(phrase.canBeJoke && playful) &&
      !(phrase.canBeQuestion && question) &&
      candidates.some((candidate) => phrase.pattern.test(candidate)),
  );
}

const OPT_OUT_CONFIRMATION = "Got it - you won't receive any more automated messages from us. 🙏";

/**
 * Builds the fulfillment email for a freshly captured lead. The link (if any) is
 * appended as its own plain-text line so it survives every mail client.
 */
function buildLeadDeliveryEmail(
  to: string,
  delivery: NonNullable<import("./types").FlowEmailCapture["delivery"]>,
): OutboundEmail {
  const lines = [delivery.message];
  if (delivery.linkUrl) {
    lines.push("", `${delivery.linkLabel ?? "Your link"}: ${delivery.linkUrl}`);
  }
  lines.push(
    "",
    `-\nYou're receiving this because you messaged our Instagram and requested it. To stop automated messages, reply STOP to our DM.`,
  );
  return { to, subject: delivery.subject, body: lines.join("\n") };
}

/**
 * Enrolls a freshly captured lead into every ACTIVE sequence that sources from the
 * automation which captured them. Idempotent per (sequence, contact); failures are
 * logged and never break the capture flow.
 */
async function enrollNewLeadInSequences(
  repository: AutomationRepository,
  mapping: WorkspaceMapping,
  accountId: string,
  sourceAutomationId: string,
  senderId: string,
): Promise<void> {
  try {
    const contact = await repository.getContact(mapping.workspaceId, accountId, senderId);
    if (!contact || contact.suppressedAt) return;
    const sequences = await repository.listActiveSequencesForSource(mapping.workspaceId, sourceAutomationId);
    for (const sequence of sequences) {
      const result = await repository.enrollContactInSequence(
        mapping.workspaceId,
        sequence.id,
        contact.id,
        sequence.steps[0]?.delayHours ?? 0,
        new Date().toISOString(),
      );
      if (result.created) {
        logger.info("Contact enrolled in sequence", {
          workspaceId: mapping.workspaceId,
          sequenceId: sequence.id,
          automationId: sourceAutomationId,
        });
      }
    }
  } catch (error) {
    logger.warn("Sequence enrollment failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
type WorkspaceMapping = NonNullable<Awaited<ReturnType<AutomationRepository["findWorkspaceByInstagramAccount"]>>>;

async function queueOrDeliverLead(
  repository: AutomationRepository,
  mapping: WorkspaceMapping,
  automationId: string,
  automationName: string,
  contactId: string,
  leadEmail: string,
  capturedAt: string,
  options: {
    delivery?: { subject: string; message: string; linkUrl?: string; linkLabel?: string };
    notifyUrl?: string;
    fields?: Record<string, string>;
  },
): Promise<void> {
  const jobs: LeadDeliveryJob[] = [];
  if (options.delivery) {
    const deliveryKey = deliveryKeys.lead(contactId, automationId, "email", "captured");
    await repository.ensureOutboundDelivery({
      deliveryKey,
      workspaceId: mapping.workspaceId,
      automationId,
      recipientId: leadEmail,
      kind: "LEAD_EMAIL",
      payload: buildLeadDeliveryEmail(leadEmail, options.delivery),
    });
    jobs.push({ deliveryKey, workspaceId: mapping.workspaceId, kind: "LEAD_EMAIL" });
  }
  if (options.notifyUrl) {
    const deliveryKey = deliveryKeys.lead(contactId, automationId, "webhook", "captured");
    await repository.ensureOutboundDelivery({
      deliveryKey,
      workspaceId: mapping.workspaceId,
      automationId,
      recipientId: leadEmail,
      kind: "LEAD_WEBHOOK",
      payload: {
        url: options.notifyUrl,
        body: {
          email: leadEmail,
          automationId,
          automationName,
          capturedAt,
          ...(options.fields ? { fields: options.fields } : {}),
        },
      },
    });
    jobs.push({ deliveryKey, workspaceId: mapping.workspaceId, kind: "LEAD_WEBHOOK" });
  }
  for (const job of jobs) {
    const queued = await enqueueLeadDelivery(job);
    if (queued) continue;
    const result = await processLeadDelivery(job, repository);
    if (result.status !== "SENT") {
      logger.warn("Lead delivery did not complete", {
        deliveryKey: job.deliveryKey,
        status: result.status,
        ...("error" in result ? { error: result.error } : {}),
      });
    }
  }
}

/**
 * Honors opt-outs before anything else runs: a STOP-style reply permanently
 * suppresses the sender (no automated send of any kind afterwards), clears any
 * pending email prompt, and gets one final confirmation. Returns the handled
 * result when the event was consumed by this phase.
 */
async function processOptOut(
  event: NormalizedEvent,
  mapping: WorkspaceMapping,
  contact: AutomationContactRecord | null,
  repository: AutomationRepository,
  options: RunnerOptions,
): Promise<RunnerResult | null> {
  if (!event.recipientId) return null;
  const dmSideText = event.type === "message.received" || event.type === "quick_reply.received";
  const wantsOut = dmSideText && isOptOutCommand(event.text);
  if (!wantsOut) return null;

  if (contact?.suppressedAt) return { matched: 0, sent: 0, skipped: 0, failed: 0 }; // already opted out - stay silent

  // First-ever interaction may be the opt-out itself; make sure a row exists.
  await repository.touchContact(mapping.workspaceId, event.accountId, event.recipientId, new Date(event.timestamp).toISOString());
  await repository.suppressContact(mapping.workspaceId, event.accountId, event.recipientId, new Date(event.timestamp).toISOString());

  if (options.client && options.tokenEncryptionKey) {
    try {
      const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);
      await sendAction(options.client, connection, {
        type: "send_text",
        recipientId: event.recipientId,
        text: OPT_OUT_CONFIRMATION,
      });
    } catch (error) {
      // Suppression itself already persisted - never undo an opt-out over a failed send.
      logger.error("Opt-out confirmation DM failed", {
        accountId: event.accountId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  logger.info("Contact opted out", { workspaceId: mapping.workspaceId, accountId: event.accountId });
  return { matched: 1, sent: options.client ? 1 : 0, skipped: 0, failed: 0 };
}

/**
 * Intercepts DMs from people who are mid email capture: validates their reply, stores
 * the address, and confirms (or asks again within a small retry budget). Returns a
 * result when the event was fully handled by the capture flow - the normal automation
 * loop must not also fire on the same message.
 */
async function processEmailCaptureReply(
  event: NormalizedEvent,
  mapping: WorkspaceMapping,
  contact: AutomationContactRecord | null,
  automations: AutomationRecord[],
  repository: AutomationRepository,
  options: RunnerOptions,
): Promise<RunnerResult | null> {
  if (!options.client || !options.tokenEncryptionKey) return null;
  if (event.type !== "message.received" && event.type !== "quick_reply.received") return null;
  if (!event.recipientId) return null;
  const senderId = event.recipientId;

  if (!contact) return null;
  if (contact.state === "AWAITING_FIELD" && contact.awaitingAutomationId) {
    const automation = automations.find((item) => item.id === contact.awaitingAutomationId);
    return processFieldAnswer(event, mapping, contact, automation, repository, options);
  }
  if (contact.state !== "AWAITING_EMAIL" || !contact.awaitingAutomationId) return null;

  const automation = automations.find((item) => item.id === contact.awaitingAutomationId);
  if (
    !automation
    || automation.status !== "ACTIVE"
    || automation.definition.version !== 1
    || !automation.definition.emailCapture
  ) {
    // The flow was deleted, paused, or its collector removed mid-conversation -
    // stop asking instead of leaving the person stuck in a prompt loop.
    await repository.clearContactAwaitingEmail(mapping.workspaceId, event.accountId, senderId);
    return null;
  }

  const emailCapture = automation.definition.emailCapture;
  const dedupeKey = `${automation.id}:${event.id}:email-reply`;
  const claimed = await repository.claimExecution({
    workspaceId: mapping.workspaceId,
    automationId: automation.id,
    externalEventId: event.id,
    dedupeKey,
  });
  if (!claimed) return null;

  let followUpDelivered = false;
  try {
    const candidate = extractEmailAddress(event.text);
    const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);
    const vars = buildTemplateVars(event);

    if (candidate) {
      await repository.captureContactEmail(
        mapping.workspaceId,
        event.accountId,
        senderId,
        candidate,
        new Date(event.timestamp).toISOString(),
        automation.id,
      );
      const fieldQueue = emailCapture.fields ?? [];
      if (fieldQueue.length > 0) {
        const delivery = await executeActionDelivery(repository, {
          deliveryKey: deliveryKeys.emailCapture(
            automation.id,
            event.id,
            `question:${fieldQueue[0].id}`,
          ),
          workspaceId: mapping.workspaceId,
          automationId: automation.id,
          instagramAccountId: event.accountId,
          recipientId: senderId,
          kind: "EMAIL_CAPTURE",
          action: { type: "send_text", recipientId: senderId, text: renderTemplate(fieldQueue[0].question, vars) },
          claimLeaseMs: options.dispatchLeaseMs ?? DEFAULT_DELIVERY_CLAIM_LEASE_MS,
          dailySendLimit: automation.definition.dailySendLimit,
          timingObserver: options.timingObserver,
        }, options.client, connection);
        const providerMessageId = requireSentDelivery(delivery, options.finalAttempt);
        followUpDelivered = true;
        // Advance only after the question is durably SENT. A retry reuses the ledger
        // row and then performs this state transition without calling Meta again.
        await repository.beginContactFieldCollection(
          mapping.workspaceId,
          event.accountId,
          senderId,
          fieldQueue,
          automation.id,
          new Date(event.timestamp).toISOString(),
        );
        await repository.completeExecution(mapping.workspaceId, dedupeKey, {
          status: "SENT",
          reason: `email_captured;field_asked:${fieldQueue[0].id}`,
          providerMessageId,
        });
        return { matched: 1, sent: 1, skipped: 0, failed: 0 };
      }
      const delivery = await executeActionDelivery(repository, {
        deliveryKey: deliveryKeys.emailCapture(automation.id, event.id, "confirmation"),
        workspaceId: mapping.workspaceId,
        automationId: automation.id,
        instagramAccountId: event.accountId,
        recipientId: senderId,
          kind: "EMAIL_CAPTURE",
          action: { type: "send_text", recipientId: senderId, text: renderTemplate(emailCapture.confirmationText, vars) },
        claimLeaseMs: options.dispatchLeaseMs ?? DEFAULT_DELIVERY_CLAIM_LEASE_MS,
        dailySendLimit: automation.definition.dailySendLimit,
        timingObserver: options.timingObserver,
      }, options.client, connection);
      const providerMessageId = requireSentDelivery(delivery, options.finalAttempt);
      followUpDelivered = true;
      await repository.clearContactAwaitingEmail(mapping.workspaceId, event.accountId, senderId);
      await queueOrDeliverLead(
        repository,
        mapping,
        automation.id,
        automation.name,
        contact.id,
        candidate,
        new Date(event.timestamp).toISOString(),
        { delivery: emailCapture.delivery, notifyUrl: emailCapture.notifyUrl },
      );
      await enrollNewLeadInSequences(repository, mapping, event.accountId, automation.id, senderId);
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SENT",
        reason: "email_captured",
        providerMessageId,
      });
      void notifyWorkspaceManagers(
        mapping.workspaceId,
        `lead:email:${contact.id}`,
        "New email captured",
        `${candidate} shared their email with your “${automation.name}” automation.`,
      ).catch(() => undefined);
      return { matched: 1, sent: 1, skipped: 0, failed: 0 };
    }

    const nextAttempt = contact.attempts + 1;
    if (nextAttempt > MAX_EMAIL_CAPTURE_RETRIES) {
      await repository.clearContactAwaitingEmail(mapping.workspaceId, event.accountId, senderId);
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SKIPPED",
        reason: "email_capture_gave_up",
      });
      return { matched: 0, sent: 0, skipped: 1, failed: 0 };
    }

    const delivery = await executeActionDelivery(repository, {
      deliveryKey: deliveryKeys.emailCapture(automation.id, event.id, `retry:${nextAttempt}`),
      workspaceId: mapping.workspaceId,
      automationId: automation.id,
      instagramAccountId: event.accountId,
      recipientId: senderId,
      kind: "EMAIL_CAPTURE",
      action: {
        type: "send_text",
        recipientId: senderId,
        text: renderTemplate(emailCapture.retryText ?? emailCapture.promptText, vars),
      },
      claimLeaseMs: options.dispatchLeaseMs ?? DEFAULT_DELIVERY_CLAIM_LEASE_MS,
      dailySendLimit: automation.definition.dailySendLimit,
      timingObserver: options.timingObserver,
    }, options.client, connection);
    const providerMessageId = requireSentDelivery(delivery, options.finalAttempt);
    followUpDelivered = true;
    const attempts = await repository.bumpContactEmailAttempt(
      mapping.workspaceId,
      event.accountId,
      senderId,
    );
    await repository.completeExecution(mapping.workspaceId, dedupeKey, {
      status: "SENT",
      reason: `email_retry:${attempts}`,
      providerMessageId,
    });
    return { matched: 1, sent: 1, skipped: 0, failed: 0 };
  } catch (error) {
    if (error instanceof DailySendLimitError) {
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SKIPPED",
        reason: DAILY_LIMIT_ERROR,
      });
      return { matched: 1, sent: 0, skipped: 1, failed: 0 };
    }
    if (followUpDelivered || findSendDeferral(error)) {
      // A deferral parks the whole event until it may send; it never fails it.
      await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
      throw findSendDeferral(error) ?? retryableAutomationError(error);
    }
    if (error instanceof MetaApiError && error.retryable && !options.finalAttempt) {
      await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
      throw retryableAutomationError(error);
    }
    await repository.completeExecution(mapping.workspaceId, dedupeKey, {
      status: "FAILED",
      reason: error instanceof Error ? error.message : "Meta delivery failed",
    });
    return { matched: 0, sent: 0, skipped: 0, failed: 1 };
  }
}

/**
 * Handles one conversational-field answer: stores it, asks the next question, and -
 * after the final answer - fires confirmation DM, fulfillment email, lead webhook,
 * sequence enrollment, and the owner notification. The lead is complete only here.
 */
async function processFieldAnswer(
  event: NormalizedEvent,
  mapping: WorkspaceMapping,
  contact: AutomationContactRecord,
  automation: AutomationRecord | undefined,
  repository: AutomationRepository,
  options: RunnerOptions,
): Promise<RunnerResult> {
  const senderId = event.recipientId!;
  if (
    !automation
    || automation.status !== "ACTIVE"
    || automation.definition.version !== 1
    || !automation.definition.emailCapture
  ) {
    await repository.clearContactAwaitingEmail(mapping.workspaceId, event.accountId, senderId);
    return { matched: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const emailCapture = automation.definition.emailCapture;
  const dedupeKey = `${automation.id}:${event.id}:field-answer`;
  const claimed = await repository.claimExecution({
    workspaceId: mapping.workspaceId,
    automationId: automation.id,
    externalEventId: event.id,
    dedupeKey,
  });
  if (!claimed) return { matched: 0, sent: 0, skipped: 0, failed: 0 };

  let followUpDelivered = false;
  try {
    const queue = contact.awaitingFields ?? [];
    const current: (typeof queue)[number] | undefined = queue[0];
    const rest = queue.slice(1);
    if (!current) {
      await repository.clearContactAwaitingEmail(mapping.workspaceId, event.accountId, senderId);
      await repository.completeExecution(mapping.workspaceId, dedupeKey, { status: "SKIPPED", reason: "field_queue_empty" });
      return { matched: 0, sent: 0, skipped: 1, failed: 0 };
    }

    const answer = event.text.trim().slice(0, 200);
    const atIso = new Date().toISOString();
    const vars = buildTemplateVars(event);

    if (!options.client || !options.tokenEncryptionKey) {
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SKIPPED",
        reason: "Meta delivery is disabled in demo mode",
      });
      return { matched: 1, sent: 0, skipped: 1, failed: 0 };
    }

    // An answer containing an exit keyword ("no thanks") politely ends the
    // question queue early - checked before validation so an exit phrase that
    // fails the field's validator (e.g. "no thanks" on an email field) still
    // ends the queue instead of re-asking. The lead keeps what was collected.
    const exitHit = (current.exitKeywords ?? []).some(
      (keyword) => answer.toLowerCase().includes(keyword.toLowerCase()),
    );

    // Typed answers are validated before anything is stored or asked next; an
    // invalid reply re-asks the same question within the shared retry budget.
    const checked = validateFieldAnswer(answer, current.kind);
    const validated = exitHit ? checked ?? "" : checked;
    if (validated === undefined) {
      const nextAttempt = contact.attempts + 1;
      if (nextAttempt > MAX_EMAIL_CAPTURE_RETRIES) {
        await repository.clearContactAwaitingEmail(mapping.workspaceId, event.accountId, senderId);
        await repository.completeExecution(mapping.workspaceId, dedupeKey, {
          status: "SKIPPED",
          reason: `field_gave_up:${current.id}`,
        });
        return { matched: 0, sent: 0, skipped: 1, failed: 0 };
      }
      const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);
      const delivery = await executeActionDelivery(repository, {
        deliveryKey: deliveryKeys.emailCapture(automation.id, event.id, `field-retry:${current.id}:${nextAttempt}`),
        workspaceId: mapping.workspaceId,
        automationId: automation.id,
        instagramAccountId: event.accountId,
        recipientId: senderId,
        kind: "EMAIL_CAPTURE",
        action: { type: "send_text", recipientId: senderId, text: renderTemplate(current.question, vars) },
        claimLeaseMs: options.dispatchLeaseMs ?? DEFAULT_DELIVERY_CLAIM_LEASE_MS,
        dailySendLimit: automation.definition.dailySendLimit,
        timingObserver: options.timingObserver,
      }, options.client, connection);
      const providerMessageId = requireSentDelivery(delivery, options.finalAttempt);
      followUpDelivered = true;
      const attempts = await repository.bumpContactEmailAttempt(
        mapping.workspaceId,
        event.accountId,
        senderId,
      );
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SENT",
        reason: `field_retry:${current.id}:${attempts}`,
        providerMessageId,
      });
      return { matched: 1, sent: 1, skipped: 0, failed: 0 };
    }

    const remainingAfter = exitHit ? [] : rest;
    const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);
    const outgoing = exitHit
      ? renderTemplate(emailCapture.exitText ?? emailCapture.confirmationText, vars)
      : remainingAfter.length > 0
        ? renderTemplate(remainingAfter[0].question, vars)
        : renderTemplate(emailCapture.confirmationText, vars);
    const delivery = await executeActionDelivery(repository, {
      deliveryKey: deliveryKeys.emailCapture(
        automation.id,
        event.id,
        `field:${current.id}:${exitHit ? "exit" : remainingAfter.length > 0 ? `question:${remainingAfter[0].id}` : "confirmation"}`,
      ),
      workspaceId: mapping.workspaceId,
      automationId: automation.id,
      instagramAccountId: event.accountId,
      recipientId: senderId,
      kind: "EMAIL_CAPTURE",
      action: { type: "send_text", recipientId: senderId, text: outgoing },
      claimLeaseMs: options.dispatchLeaseMs ?? DEFAULT_DELIVERY_CLAIM_LEASE_MS,
      dailySendLimit: automation.definition.dailySendLimit,
      timingObserver: options.timingObserver,
    }, options.client, connection);
    const providerMessageId = requireSentDelivery(delivery, options.finalAttempt);
    followUpDelivered = true;

    // Persist the answer transition only after the next prompt/confirmation is
    // durably SENT. If this write fails, the same event reuses SENT and retries it.
    const updated = await repository.recordContactFieldAnswer(
      mapping.workspaceId,
      event.accountId,
      senderId,
      current.id,
      validated,
      remainingAfter,
      atIso,
    );
    if (!updated) {
      // Another reply from this person, processed concurrently, already
      // answered this question; keep its answer instead of overwriting it.
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SKIPPED",
        reason: `field_already_answered:${current.id}`,
        providerMessageId,
      });
      return { matched: 1, sent: 1, skipped: 0, failed: 0 };
    }

    let completionReason = `field_answered:${current.id}`;
    if (updated.state === "CAPTURED") {
      completionReason = updated.email ? "lead_complete" : "lead_complete:no-email";
      if (updated.email) {
        await queueOrDeliverLead(
          repository,
          mapping,
          automation.id,
          automation.name,
          contact.id,
          updated.email,
          atIso,
          {
            delivery: emailCapture.delivery,
            notifyUrl: emailCapture.notifyUrl,
            fields: updated.fields ?? {},
          },
        );
      }
      await enrollNewLeadInSequences(repository, mapping, event.accountId, automation.id, senderId);
      void notifyWorkspaceManagers(
        mapping.workspaceId,
        `lead:email:${contact.id}`,
        "New lead captured",
        `${updated.email ?? senderId} completed “${automation.name}”${updated.fields ? ` (${Object.values(updated.fields).join(", ")})` : ""}.`,
      ).catch(() => undefined);
    }

    await repository.completeExecution(mapping.workspaceId, dedupeKey, {
      status: "SENT",
      reason: completionReason,
      providerMessageId,
    });
    return { matched: 1, sent: 1, skipped: 0, failed: 0 };
  } catch (error) {
    if (error instanceof DailySendLimitError) {
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SKIPPED",
        reason: DAILY_LIMIT_ERROR,
      });
      return { matched: 1, sent: 0, skipped: 1, failed: 0 };
    }
    if (followUpDelivered || findSendDeferral(error)) {
      // A deferral parks the whole event until it may send; it never fails it.
      await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
      throw findSendDeferral(error) ?? retryableAutomationError(error);
    }
    if (error instanceof MetaApiError && error.retryable && !options.finalAttempt) {
      await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
      throw retryableAutomationError(error);
    }
    await repository.completeExecution(mapping.workspaceId, dedupeKey, {
      status: "FAILED",
      reason: error instanceof Error ? error.message : "Meta delivery failed",
    });
    return { matched: 0, sent: 0, skipped: 0, failed: 1 };
  }
}

/**
 * Which workspace each Instagram account belonged to when last seen, per
 * repository (database). Only a hint for reading ahead (see processEvent):
 * every value it steers is still read fresh, and a stale hint just costs a
 * re-read.
 */
const workspaceHintsByRepository = new WeakMap<AutomationRepository, Map<string, string>>();
const WORKSPACE_HINT_LIMIT = 10_000;

function workspaceHintsFor(repository: AutomationRepository): Map<string, string> {
  const base = underlyingRepository(repository);
  let hints = workspaceHintsByRepository.get(base);
  if (!hints) {
    hints = new Map();
    workspaceHintsByRepository.set(base, hints);
  }
  return hints;
}

function rememberWorkspaceHint(workspaceHints: Map<string, string>, accountId: string, workspaceId: string): void {
  if (workspaceHints.get(accountId) === workspaceId) return;
  workspaceHints.delete(accountId);
  if (workspaceHints.size >= WORKSPACE_HINT_LIMIT) {
    const oldest = workspaceHints.keys().next().value;
    if (oldest !== undefined) workspaceHints.delete(oldest);
  }
  workspaceHints.set(accountId, workspaceId);
}

type EventGatekeeping = {
  workspaceStatus: WorkspaceStatus | null;
  automations: AutomationRecord[];
  contact: AutomationContactRecord | null;
  isPaused: boolean;
  /** Campaign participant already created for this comment (comment events with campaigns on). */
  sourceParticipant?: AutomationParticipantRecord | null;
};

/**
 * Everything the gatekeeping below needs is a read keyed only by the workspace
 * and the sender, so it is fetched in one parallel round - this sits directly
 * in front of the first Meta send.
 */
async function readEventGatekeeping(
  repository: AutomationRepository,
  workspaceId: string,
  event: NormalizedEvent,
  readSourceParticipant: boolean,
): Promise<EventGatekeeping> {
  const [workspaceStatus, automations, contact, isPaused, sourceParticipant] = await Promise.all([
    repository.getWorkspaceStatus(workspaceId),
    repository.listActiveAutomationsForInstagramAccount(workspaceId, event.accountId),
    event.recipientId
      ? repository.getContact(workspaceId, event.accountId, event.recipientId)
      : Promise.resolve(null),
    event.recipientId
      ? repository.hasPausedParticipant(workspaceId, event.accountId, event.recipientId)
      : Promise.resolve(false),
    readSourceParticipant && event.commentId
      ? repository.findParticipantBySource(workspaceId, event.accountId, event.commentId)
      : Promise.resolve(undefined),
  ]);
  return {
    workspaceStatus,
    automations,
    contact,
    isPaused,
    ...(readSourceParticipant ? { sourceParticipant } : {}),
  };
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
}

function unwrap<T>(settled: Settled<T>): T {
  if (!settled.ok) throw settled.error;
  return settled.value;
}

/** Writes the runner started early and only needs settled before the job ends. */
type DeferredWrites = { contactTouch?: Promise<Settled<unknown>> };

export async function processNormalizedEvent(
  event: NormalizedEvent,
  repository: AutomationRepository,
  options: RunnerOptions = {},
): Promise<RunnerResult | CampaignRunnerResult> {
  const deferred: DeferredWrites = {};
  let result: RunnerResult | CampaignRunnerResult;
  try {
    result = await processEvent(event, repository, options, deferred);
  } catch (error) {
    await deferred.contactTouch;
    throw error;
  }
  // A contact touch that ran alongside the send still has to land: a failure
  // fails the job, and the retry is idempotent (claims and the ledger stop a
  // second send) while the touch runs again.
  if (deferred.contactTouch) unwrap(await deferred.contactTouch);
  return result;
}

async function processEvent(
  event: NormalizedEvent,
  repository: AutomationRepository,
  options: RunnerOptions,
  deferred: DeferredWrites,
): Promise<RunnerResult | CampaignRunnerResult> {
  // The workspace lookup and the gatekeeping reads used to be two serial
  // rounds. The account's workspace almost never changes, so the reads start
  // alongside the lookup using the last workspace seen for this account; they
  // are only used when the fresh lookup confirms it (otherwise discarded and
  // read again), so nothing below ever acts on stale data.
  const readSourceParticipant = options.campaignsEnabled === true
    && event.type === "comment.created"
    && Boolean(event.commentId);
  const workspaceHints = workspaceHintsFor(repository);
  const hint = workspaceHints.get(event.accountId);
  if (hint) void prefetchDeliveryEntitlements(hint);
  const [mapping, speculative] = await Promise.all([
    repository.findWorkspaceByInstagramAccount(event.accountId),
    hint ? settle(readEventGatekeeping(repository, hint, event, readSourceParticipant)) : undefined,
  ]);
  if (!mapping) {
    workspaceHints.delete(event.accountId);
    return { matched: 0, sent: 0, skipped: 0, failed: 0 };
  }
  rememberWorkspaceHint(workspaceHints, event.accountId, mapping.workspaceId);
  if (hint !== mapping.workspaceId) void prefetchDeliveryEntitlements(mapping.workspaceId);
  const { workspaceStatus, automations, contact, isPaused, sourceParticipant } = speculative && hint === mapping.workspaceId
    ? unwrap(speculative)
    : await readEventGatekeeping(repository, mapping.workspaceId, event, readSourceParticipant);
  if (workspaceStatus !== "ACTIVE") {
    return { matched: 0, sent: 0, skipped: 0, failed: 0 };
  }

  // Persist a compact summary for the workspace activity inbox. Idempotent per
  // event id, and never allowed to break event processing.
  void repository.recordWebhookEvent(mapping.workspaceId, {
      providerEventId: event.id,
      eventType: event.type,
      receivedAt: new Date(options.receivedAt ?? Date.now()).toISOString(),
      payload: {
        accountId: event.accountId,
        ...(event.storyId ? { storyId: event.storyId } : {}),
        ...(event.interactionPayload ? { interactionPayload: event.interactionPayload } : {}),
        ...(event.recipientId ? { recipientId: event.recipientId } : {}),
        ...(event.senderUsername ? { senderUsername: event.senderUsername } : {}),
        ...(event.mediaId ? { mediaId: event.mediaId } : {}),
        ...(event.commentId ? { commentId: event.commentId } : {}),
        ...(event.attachmentType ? { attachmentType: event.attachmentType } : {}),
        ...(event.attachmentUrl ? { attachmentUrl: event.attachmentUrl } : {}),
        text: event.text ?? "",
        replayVersion: 1,
        timestamp: event.timestamp,
      },
    }).catch((error) => {
    logger.warn("Failed to persist webhook activity", {
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  // Opt-outs win over everything: a STOP-style reply permanently suppresses the
  // sender and is answered once. Suppressed senders are invisible to every engine
  // (classic, campaign, capture, comments) from here on.
  if (event.recipientId) {
    const optOut = await processOptOut(event, mapping, contact, repository, options);
    if (optOut) return optOut;
  }

  // Every legitimate inbound sender belongs in the workspace contact registry.
  // Besides powering first-contact triggers and email capture, this is the source
  // of truth for Contacts and for opening a conversation from Inbox. Touched before
  // any early return (suppressed/paused/capture) so the registry sees every event.
  let evaluationContext: EvaluationContext = {};
  const needsContactTracking = automations.some(
    (automation) =>
      automation.definition.version === 1
      && (automation.definition.trigger.type === "first_contact"
        || Boolean(automation.definition.emailCapture)
        || Boolean(automation.definition.followUps?.length)),
  );
  if (event.recipientId && CONTACT_TOUCH_EVENT_TYPES.includes(event.type)) {
    // `contact` was read in the parallel round above, so the touch is a single
    // write instead of a read-then-write in front of every send.
    const touching = repository.touchContact(
      mapping.workspaceId,
      event.accountId,
      event.recipientId,
      new Date(event.timestamp).toISOString(),
      contact,
    );
    if (!needsContactTracking) {
      // Nothing below reads the touch's result, so it runs alongside the
      // reply instead of in front of it; processNormalizedEvent waits for it
      // before the job finishes.
      deferred.contactTouch = settle(touching);
    } else {
      const touch = await touching;
      // A contact's createdAt is the timestamp of the earliest event seen from
      // them, so this event is their first contact exactly when nothing earlier
      // exists. Unlike `touch.created`, that still holds when the job is retried
      // after the first attempt already created the row.
      evaluationContext = {
        isNewContact: touch.created || Date.parse(touch.record.createdAt) >= event.timestamp,
      };
    }
  }
  // A reply to a Story belongs to a matching story-reply flow when one exists;
  // generic DM flows then stay quiet so the person gets a single answer.
  if (event.storyId) {
    const storyContext = evaluationContext;
    const storyReplyClaimed = automations.some((automation) =>
      automation.definition.version === 1
      && automation.definition.trigger.type === "story_reply"
      && evaluateFlow(automation.definition, event, { ...storyContext, automationId: automation.id }).status !== "skipped");
    evaluationContext = { ...evaluationContext, storyReplyClaimed };
  }

  if (event.recipientId) {
    if (contact?.suppressedAt) return { matched: 0, sent: 0, skipped: 0, failed: 0 };
    // Human handoff: if any active participant for this sender is paused, the
    // runner stays silent. The teammate can resume from the contact modal.
    if (isPaused) return { matched: 0, sent: 0, skipped: 1, failed: 0 };
    // A teammate replied to this person by hand (Instagram app or Linkar
    // inbox): automations stay out of the conversation until the pause ends.
    if (contactAutomationsPaused(contact, event.timestamp)) return { matched: 0, sent: 0, skipped: 1, failed: 0 };
  }

  // Email-capture conversations take precedence over everything else: a DM carrying
  // someone's email address must never also fire a keyword autoresponder or campaign.
  if (options.client && options.tokenEncryptionKey) {
    const captured = await processEmailCaptureReply(
      event,
      mapping,
      contact,
      automations,
      repository,
      options,
    );
    if (captured) return captured;
  }

  if (options.campaignsEnabled === true) {
    const campaignOptions = { ...options, activeAutomations: automations };
    const interaction = await processPendingCampaignInteraction(
      event,
      mapping,
      repository,
      campaignOptions,
    );
    if (interaction.handled) return interaction.result;

    if (event.type === "comment.created" && event.commentId) {
      // Read in the gatekeeping round above.
      const participant = sourceParticipant !== undefined
        ? sourceParticipant
        : await repository.findParticipantBySource(
          mapping.workspaceId,
          event.accountId,
          event.commentId,
        );
      if (participant) {
        // The comment's own time, so a retry still sees a comment that has
        // crossed Meta's 7-day private reply window since the first attempt.
        // A replayed or parked comment whose campaign the owner has paused
        // since sends nothing; the participant still consumes the comment.
        return processExistingCampaignParticipant(
          participant,
          mapping,
          repository,
          { ...campaignOptions, sourceCommentTimestamp: event.timestamp, requireActiveAutomation: true },
        );
      }
    }

    // The comment's participant lookup just ran above, so each campaign below
    // can skip repeating it - that was one serial round trip per campaign.
    const perCampaignOptions = event.type === "comment.created" && event.commentId
      ? { ...campaignOptions, sourceParticipantChecked: true }
      : campaignOptions;
    for (const campaign of automations) {
      if (campaign.definition.version !== 2) continue;
      const campaignResult = await processCampaignEvent(
        event,
        campaign,
        mapping,
        repository,
        perCampaignOptions,
      );
      if (campaignResult.handled) return campaignResult;
    }
  }

  const result: RunnerResult = { matched: 0, sent: 0, skipped: 0, failed: 0 };
  const skippedExecutions: RecordExecutionInput[] = [];

  try {
    // Meta permits exactly one private reply per comment ("Only one message can
    // be sent to the commenter"), so a comment event has a single winning
    // automation - the Facebook runner already works this way via
    // winnerSelected. Without this, two flows whose keywords both match one
    // comment each sent their own private reply to the same person.
    let commentWinnerSelected = false;
    // A "reply to any message" flow is the default reply: it answers only
    // messages no other automation matched, so it is evaluated last.
    let answeredByAnotherFlow = false;
    const ordered = [
      ...automations.filter((automation) => !isDefaultReplyFlow(automation)),
      ...automations.filter(isDefaultReplyFlow),
    ];

    for (const automation of ordered) {
      if (automation.definition.version !== 1) continue;

      const dedupeKey = `${automation.id}:${event.id}`;
      // The id lets the once-per-automation warning for a regex keyword that no
      // longer compiles name the automation, as the Facebook runner's does.
      const evaluation = evaluateFlow(automation.definition, event, { ...evaluationContext, automationId: automation.id });
      if (evaluation.status === "matched" && isDefaultReplyFlow(automation) && answeredByAnotherFlow) {
        skippedExecutions.push({
          workspaceId: mapping.workspaceId,
          automationId: automation.id,
          externalEventId: event.id,
          dedupeKey,
          status: "SKIPPED",
          reason: "another automation answered this message",
        });
        continue;
      }
      // Matched counts even when the claim is lost below (a retry of an event
      // that flow already answered), so the default reply never doubles up.
      if (evaluation.status === "matched" && !isDefaultReplyFlow(automation)) answeredByAnotherFlow = true;
      if (evaluation.status === "skipped") {
        skippedExecutions.push({
          workspaceId: mapping.workspaceId,
          automationId: automation.id,
          externalEventId: event.id,
          dedupeKey,
          status: "SKIPPED",
          reason: evaluation.reason,
        });
        continue;
      }

      if (event.type === "comment.created" && commentWinnerSelected) {
        skippedExecutions.push({
          workspaceId: mapping.workspaceId,
          automationId: automation.id,
          externalEventId: event.id,
          dedupeKey,
          status: "SKIPPED",
          reason: "another automation already replied to this comment (Meta allows one private reply per comment)",
        });
        continue;
      }

      // The first action's ledger row is read alongside the claim instead of
      // after it. A ledger row only ever moves forward, so reading it early can
      // at worst reserve a daily slot that executeOutboundDelivery - which
      // stays authoritative - hands back.
      const firstDelivery = options.client && options.tokenEncryptionKey
        ? settle(repository.getOutboundDelivery(deliveryKeys.classicAction(automation.id, event.id, 0)))
        : undefined;
      const claimed = await repository.claimExecution({
        workspaceId: mapping.workspaceId,
        automationId: automation.id,
        externalEventId: event.id,
        dedupeKey,
      });
      if (!claimed) {
        // Lost the claim: if that execution already replied (SENT) or is
        // replying right now (PROCESSING under a live lease), it owns the
        // comment's one private reply - lower-priority flows must stay quiet.
        // A SKIPPED/FAILED execution never replied, so the slot stays open.
        if (event.type === "comment.created" && !commentWinnerSelected) {
          const existing = await repository.getExecution(mapping.workspaceId, dedupeKey);
          if (existing?.status === "SENT" || existing?.status === "PROCESSING") commentWinnerSelected = true;
        }
        continue;
      }
      // Claimed, so this automation owns the comment.
      if (event.type === "comment.created") commentWinnerSelected = true;

      result.matched += 1;

      // "Reply once per person" short-circuit. The claimed execution row is
      // completed as SKIPPED so the activity inbox explains why nothing went out.
      if (
        automation.definition.trigger.type === "comment"
        && automation.definition.trigger.replyOncePerUser
        && event.recipientId
      ) {
        // Classic flows reply through the outbound ledger (v2 campaigns are
        // the ones with participants), so count replies this automation
        // already sent - or is sending - to the person, excluding this
        // event's own rows so a retry of the first reply is not skipped.
        const prior = await repository.countClassicRepliesToRecipient(
          mapping.workspaceId,
          automation.id,
          event.accountId,
          event.recipientId,
          event.id,
        );
        if (prior > 0) {
          await repository.completeExecution(mapping.workspaceId, dedupeKey, {
            status: "SKIPPED",
            reason: "replyOncePerUser is set and this sender already triggered this flow",
          });
          result.skipped += 1;
          continue;
        }
      }

      if (!options.client) {
        await repository.completeExecution(mapping.workspaceId, dedupeKey, {
          status: "SKIPPED",
          reason: "Meta delivery is disabled in demo mode",
        });
        result.skipped += 1;
        continue;
      }

      if (!options.tokenEncryptionKey) {
        await repository.completeExecution(mapping.workspaceId, dedupeKey, {
          status: "FAILED",
          reason: "Token encryption key is not configured",
        });
        result.failed += 1;
        continue;
      }

      // Email-collection follow-up: append the prompt (or, when the triggering message
    // already contains an address, the confirmation) after this flow's own actions.
    // Comment flows are excluded - they may only send a single private reply.
    const templateVars = buildTemplateVars(event, evaluation.matchedKeyword);
    let actionsToSend: ExecutionAction[] = evaluation.actions.map((action) => personalizeAction(action, templateVars));
    let captureOutcome: "prompt" | "instant" | null = null;
    const senderId = event.recipientId;
    if (
      automation.definition.emailCapture
      && automation.definition.trigger.type !== "comment"
      && senderId
    ) {
      if (!contact?.email) {
        const embeddedEmail = extractEmailAddress(event.text);
        if (embeddedEmail) {
          captureOutcome = "instant";
          // With conversational fields the follow-up is question 1, not the confirmation.
          const followUpText =
            automation.definition.emailCapture.fields?.[0]?.question
            ?? automation.definition.emailCapture.confirmationText;
          actionsToSend = [
            ...actionsToSend,
            { type: "send_text", recipientId: senderId, text: renderTemplate(followUpText, templateVars) },
          ];
        } else {
          captureOutcome = "prompt";
          actionsToSend = [
            ...actionsToSend,
            {
              type: "send_text",
              recipientId: senderId,
              text: renderTemplate(automation.definition.emailCapture.promptText, templateVars),
            },
          ];
        }
      }
    }

    let allActionsDelivered = false;
    try {
      const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);
      let providerMessageId: string | undefined;
      for (const [index, action] of actionsToSend.entries()) {
        const delivery = await executeActionDelivery(repository, {
          deliveryKey: deliveryKeys.classicAction(automation.id, event.id, index),
          workspaceId: mapping.workspaceId,
          automationId: automation.id,
          instagramAccountId: event.accountId,
          recipientId: event.recipientId,
          kind: "CLASSIC_ACTION",
          action,
          claimLeaseMs: options.dispatchLeaseMs ?? DEFAULT_DELIVERY_CLAIM_LEASE_MS,
          dailySendLimit: automation.definition.dailySendLimit,
          timingObserver: options.timingObserver,
          sourceEventTimestamp: event.timestamp,
          ...(index === 0 && firstDelivery ? { existingDelivery: firstDelivery } : {}),
        }, options.client, connection);
        providerMessageId = requireSentDelivery(delivery, options.finalAttempt) ?? providerMessageId;
      }
      allActionsDelivered = true;
      if (captureOutcome && senderId) {
        const atIso = new Date().toISOString();
        if (captureOutcome === "instant") {
          // Re-derive the address: extractEmailAddress returns undefined when
          // the text did not contain a match, and the ! assertion would
          // otherwise persist undefined as the lead's email.
          const capturedEmail = extractEmailAddress(event.text);
          if (!capturedEmail) {
            // Defensive: captureOutcome === "instant" is only set when an
            // email is found, but a parallel definition edit (or a race with
            // an external text-mutating transform) could erase it. Fall back
            // to the prompt path so the lead is at least surfaced for follow-up
            // instead of stored as undefined.
            captureOutcome = "prompt";
          } else {
            await repository.captureContactEmail(
              mapping.workspaceId,
              event.accountId,
              senderId,
              capturedEmail,
              atIso,
              automation.id,
            );
            const fieldQueue = automation.definition.emailCapture?.fields ?? [];
            if (fieldQueue.length > 0) {
              // Conversational form in progress - confirmation + fulfillment + enrollment
              // fire after the last answer (processFieldAnswer).
              //
              // The whole queue is stored, including the question just asked above as
              // `followUpText`, because processFieldAnswer treats queue[0] as the
              // outstanding question. Dropping it here filed the reply under the *next*
              // field's id and skipped that field - and with a single field it left an
              // empty queue that abandoned the lead as `field_queue_empty`.
              await repository.beginContactFieldCollection(
                mapping.workspaceId,
                event.accountId,
                senderId,
                fieldQueue,
                automation.id,
                atIso,
              );
            } else {
              await queueOrDeliverLead(
                repository,
                mapping,
                automation.id,
                automation.name,
                `${automation.id}:${senderId}`,
                capturedEmail,
                atIso,
                {
                  delivery: automation.definition.emailCapture?.delivery,
                  notifyUrl: automation.definition.emailCapture?.notifyUrl,
                },
              );
              await enrollNewLeadInSequences(repository, mapping, event.accountId, automation.id, senderId);
              void notifyWorkspaceManagers(
                mapping.workspaceId,
                `lead:email:${senderId}`,
                "New email captured",
                `An email was captured via your “${automation.name}” automation.`,
              ).catch(() => undefined);
            }
          }
        } else {
          await repository.setContactAwaitingEmail(mapping.workspaceId, event.accountId, senderId, automation.id, atIso);
        }
      }
      // Scheduled nudges: rendered now (tokens baked in), delivered later by the
      // worker, which re-checks opt-outs and the 24-hour window. Enqueued before
      // the execution is completed so a queue hiccup retries the whole event -
      // ledger rows and deterministic job IDs make every step idempotent.
      const followUps = automation.definition.version === 1 ? automation.definition.followUps ?? [] : [];
      if (followUps.length > 0 && senderId && automation.definition.trigger.type !== "comment") {
        const followUpJobs: FlowFollowUpJob[] = followUps.map((followUp, index) => ({
          deliveryKey: deliveryKeys.followUp(automation.id, event.id, index),
          workspaceId: mapping.workspaceId,
          automationId: automation.id,
          instagramAccountId: event.accountId,
          recipientId: senderId,
          delayMinutes: followUp.delayMinutes,
          message:
            followUp.buttonLabel && followUp.url
              ? {
                  type: "button" as const,
                  text: renderTemplate(followUp.text, templateVars),
                  buttonLabel: renderTemplate(followUp.buttonLabel!, templateVars),
                  url: followUp.url!,
                }
              : { type: "text" as const, text: renderTemplate(followUp.text, templateVars) },
        }));
        await enqueueFlowFollowUps(followUpJobs);
      }
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SENT",
        providerMessageId,
      });
      result.sent += 1;
    } catch (error) {
      if (error instanceof DailySendLimitError) {
        await repository.completeExecution(mapping.workspaceId, dedupeKey, {
          status: "SKIPPED",
          reason: DAILY_LIMIT_ERROR,
        });
        result.skipped += 1;
        continue;
      }
      if (allActionsDelivered || findSendDeferral(error)) {
        // A deferral parks the whole event until it may send; it never fails it.
        await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
        throw findSendDeferral(error) ?? retryableAutomationError(error);
      }
      if (error instanceof MetaApiError && error.retryable && !options.finalAttempt) {
        await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
        throw retryableAutomationError(error);
      }
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "FAILED",
        reason: error instanceof Error ? error.message : "Meta delivery failed",
      });
      result.failed += 1;
    }
    }
  } finally {
    if (skippedExecutions.length > 0) {
      try {
        result.skipped += await repository.recordExecutions(skippedExecutions);
      } catch (error) {
        logger.warn("Failed to persist skipped automation outcomes", {
          eventId: event.id,
          count: skippedExecutions.length,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return result;
}
