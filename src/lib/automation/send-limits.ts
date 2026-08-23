import type { AutomationRepository } from "../repository";

export type SendLimitContext = {
  automationId: string;
  repository: AutomationRepository;
  limit?: number;
  now?: Date;
};

export type SendLimitReservation =
  | { allowed: true; utcDate: string; amount: number }
  | { allowed: false; reason: "daily_limit" };

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function reserveDailySendSlots(
  context: SendLimitContext,
  amount: number,
): Promise<SendLimitReservation> {
  const date = utcDate(context.now ?? new Date());
  if (!context.limit || context.limit <= 0) {
    return { allowed: true, utcDate: date, amount: 0 };
  }
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
