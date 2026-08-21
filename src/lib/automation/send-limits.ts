import { getRepository } from "../repository-provider";

export type SendLimitContext = {
    workspaceId: string;
    automationId: string;
    now?: Date;
};

export type SendLimitDecision =
    | { allowed: true }
    | { allowed: false; reason: string };

// Per-automation daily cap: bounds blast radius when a trigger misfires
// (e.g. a keyword that matches every comment) and keeps volume inside what
// Meta's messaging quality signals tolerate.
export async function checkDailySendLimit(
    definition: { dailySendLimit?: number },
    ctx: SendLimitContext,
): Promise<SendLimitDecision> {
    if (!definition.dailySendLimit || definition.dailySendLimit <= 0) return { allowed: true };
    const now = ctx.now ?? new Date();
    const since = new Date(now);
    since.setUTCHours(0, 0, 0, 0);
    const sentToday = await getRepository().countExecutionsSentSince(ctx.automationId, since.toISOString());
    if (sentToday >= definition.dailySendLimit) {
        return { allowed: false, reason: `daily_send_limit_reached:${sentToday}/${definition.dailySendLimit}` };
    }
    return { allowed: true };
}

// Workspace-level monthly participant ceiling for the current plan tier.
// The FREE tier default keeps an MVP deployment inside predictable cost and
// Meta quality boundaries; paid tiers raise it via PLAN_MONTHLY_PARTICIPANT_LIMIT.
const DEFAULT_MONTHLY_LIMIT = Number(process.env.PLAN_MONTHLY_PARTICIPANT_LIMIT ?? 500);

export async function checkMonthlyParticipantLimit(ctx: SendLimitContext): Promise<SendLimitDecision> {
    const limit = DEFAULT_MONTHLY_LIMIT;
    if (!Number.isFinite(limit) || limit <= 0) return { allowed: true };
    const now = ctx.now ?? new Date();
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const createdThisMonth = await getRepository().countParticipantsCreatedSince(ctx.workspaceId, since.toISOString());
    if (createdThisMonth >= limit) {
        return { allowed: false, reason: `monthly_participant_limit_reached:${createdThisMonth}/${limit}` };
    }
    return { allowed: true };
}

// Template variables available in reply texts: {username}, {keyword}.
// Unknown placeholders are left untouched so typos never corrupt a reply.
export function renderTemplate(text: string, variables: Record<string, string | undefined>): string {
    return text.replace(/\{(\w+)\}/g, (match, key: string) => variables[key] ?? match);
}