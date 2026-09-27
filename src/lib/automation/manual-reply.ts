import type { AutomationRepository } from "../repository";

/**
 * How long automations stay silent for someone after a teammate replies to
 * them by hand. Long enough to cover a real conversation; "Resume automations"
 * in the inbox ends it early.
 */
export const MANUAL_REPLY_PAUSE_MS = 12 * 60 * 60 * 1_000;
/** How far back an echo is compared against automated sends. */
const MATCH_WINDOW_MS = 15 * 60 * 1_000;
export const MANUAL_REPLY_REASON = "manual_reply";
const RECENT_TEXT_WINDOW_MS = 5 * 60 * 1_000;

/** Every text string a delivery payload would put in a message, whatever its shape. */
function payloadTexts(value: unknown, depth = 0): string[] {
  if (depth > 4 || !value || typeof value !== "object") return [];
  const texts: string[] = [];
  for (const [key, entry] of Object.entries(value as JsonRecord)) {
    if ((key === "text" || key === "caption") && typeof entry === "string") texts.push(entry.trim());
    else if (entry && typeof entry === "object") texts.push(...payloadTexts(entry, depth + 1));
  }
  return texts;
}

/** A message the connected account sent, as echoed back by Meta. */
export type ManualReplyEcho = {
  messageId: string;
  accountId: string;
  /** The person the account wrote to. */
  recipientId: string;
  timestamp: number;
  /** Message text, when the echo carries one. */
  text?: string;
};

export type ManualReplyOutcome =
  /** An automation sent it - nothing to do. */
  | "automated"
  /** A person on the team sent it - automations for this contact are paused. */
  | "paused"
  /** An automated send to this account is still settling; decide again shortly. */
  | "undecided"
  | "ignored";

type JsonRecord = Record<string, unknown>;
const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

/**
 * Pulls the account's own outgoing messages out of an Instagram webhook.
 * Meta echoes every message the account sends - from Linkar's automations,
 * from the Linkar inbox, and from the Instagram app - on the `messages` field.
 */
export function normalizeManualReplyEchoes(payload: unknown): ManualReplyEcho[] {
  const entries = asRecord(payload)?.entry;
  if (!Array.isArray(entries)) return [];
  const echoes: ManualReplyEcho[] = [];
  for (const entryValue of entries) {
    const entry = asRecord(entryValue);
    const accountId = asString(entry?.id);
    if (!entry || !accountId || !Array.isArray(entry.messaging)) continue;
    for (const itemValue of entry.messaging) {
      const item = asRecord(itemValue);
      const message = asRecord(item?.message);
      if (!item || !message || message.is_echo !== true || message.is_deleted === true) continue;
      const senderId = asString(asRecord(item.sender)?.id);
      const recipientId = asString(asRecord(item.recipient)?.id);
      const messageId = asString(message.mid);
      if (senderId !== accountId || !recipientId || recipientId === accountId || !messageId) continue;
      const text = asString(message.text);
      echoes.push({
        messageId,
        accountId,
        recipientId,
        timestamp: typeof item.timestamp === "number" ? item.timestamp : Date.now(),
        ...(text ? { text } : {}),
      });
    }
  }
  return echoes;
}

/**
 * Tells a teammate's hand-written reply apart from Linkar's own automated
 * sends, and pauses automations for that person when a human took over - so
 * the bot never talks over a real conversation.
 */
export async function processManualReplyEcho(
  echo: ManualReplyEcho,
  repository: AutomationRepository,
): Promise<ManualReplyOutcome> {
  const mapping = await repository.findWorkspaceByInstagramAccount(echo.accountId);
  if (!mapping) return "ignored";
  const since = new Date(echo.timestamp - MATCH_WINDOW_MS).toISOString();

  const [ledgerMatch, executionMatch] = await Promise.all([
    repository.hasAutomatedOutboundMessage(mapping.workspaceId, echo.messageId),
    repository.hasExecutionWithProviderMessage(mapping.workspaceId, echo.messageId, since),
  ]);
  if (ledgerMatch || executionMatch) return "automated";

  // Belt and braces: an automated message sent moments ago with exactly this
  // text is ours even if Meta's echo id doesn't line up with the id its send
  // API returned. Wrongly pausing the bot costs far more than missing a pause.
  if (echo.text) {
    const recentSince = new Date(echo.timestamp - RECENT_TEXT_WINDOW_MS).toISOString();
    const payloads = await repository.listRecentAutomatedDeliveryPayloads(mapping.workspaceId, echo.accountId, recentSince, 100);
    const echoText = echo.text.trim();
    if (payloads.some((payload) => payloadTexts(payload).includes(echoText))) return "automated";
  }

  // Meta can echo an automated send before its message id is recorded. While
  // any automated send from this account is still settling, don't guess.
  const inFlightSince = new Date(echo.timestamp - 2 * 60 * 1_000).toISOString();
  if (await repository.hasInFlightAutomatedDelivery(mapping.workspaceId, echo.accountId, inFlightSince)) {
    return "undecided";
  }

  const paused = await repository.pauseContactAutomations(
    mapping.workspaceId,
    echo.accountId,
    echo.recipientId,
    new Date(echo.timestamp + MANUAL_REPLY_PAUSE_MS).toISOString(),
    MANUAL_REPLY_REASON,
  );
  return paused ? "paused" : "ignored";
}

/** Whether automations should stay silent for this contact at `atMs`. */
export function contactAutomationsPaused(
  contact: { automationsPausedUntil?: string } | null | undefined,
  atMs: number,
): boolean {
  const until = contact?.automationsPausedUntil ? Date.parse(contact.automationsPausedUntil) : Number.NaN;
  return Number.isFinite(until) && until > atMs;
}
