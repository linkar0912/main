import type { AutomationRepository } from "../repository";

export type SendLimitContext = {
  automationId: string;
  repository: AutomationRepository;
  limit?: number;
  now?: Date;
  /** Owning workspace; its configured timezone decides when "today" starts. */
  workspaceId?: string;
  /** Explicit IANA timezone (skips the workspace lookup). */
  timezone?: string;
};

export type SendLimitReservation =
  | { allowed: true; utcDate: string; amount: number }
  | { allowed: false; reason: "daily_limit" };

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The calendar date of `now` in `timezone` (YYYY-MM-DD). A daily limit that
 * resets at UTC midnight resets mid-afternoon or mid-morning for most
 * workspaces; bucketing by the workspace's own date makes "per day" mean the
 * owner's day. Falls back to UTC when no (valid) timezone is configured.
 */
export function bucketDate(now: Date, timezone?: string): string {
  if (!timezone) return utcDate(now);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
    const date = `${part("year")}-${part("month")}-${part("day")}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : utcDate(now);
  } catch {
    return utcDate(now);
  }
}

async function resolveTimezone(context: SendLimitContext): Promise<string | undefined> {
  if (context.timezone) return context.timezone;
  if (!context.workspaceId) return undefined;
  const window = await context.repository.getMessagingWindow(context.workspaceId).catch(() => null);
  return window?.timezone;
}

export async function reserveDailySendSlots(
  context: SendLimitContext,
  amount: number,
): Promise<SendLimitReservation> {
  const now = context.now ?? new Date();
  if (!context.limit || context.limit <= 0) {
    return { allowed: true, utcDate: utcDate(now), amount: 0 };
  }
  const date = bucketDate(now, await resolveTimezone(context));
  const allowed = await context.repository.claimAutomationSendSlots(
    context.automationId,
    date,
    amount,
    context.limit,
  );
  return allowed
    ? { allowed: true, utcDate: date, amount }
    : { allowed: false, reason: "daily_limit" };
}

export async function releaseDailySendSlots(
  context: Pick<SendLimitContext, "automationId" | "repository">,
  reservation: SendLimitReservation,
): Promise<void> {
  if (!reservation.allowed || reservation.amount === 0) return;
  await context.repository.releaseAutomationSendSlots(
    context.automationId,
    reservation.utcDate,
    reservation.amount,
  );
}

// Template variables available in reply texts: {username}, {keyword}.
// Unknown placeholders are left untouched so typos never corrupt a reply.
export function renderTemplate(text: string, variables: Record<string, string | undefined>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => variables[key] ?? match);
}
