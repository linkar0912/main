import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import type { AutomationRepository } from "@/src/lib/repository";
import { getEntitlementService } from "@/src/lib/entitlements/service";

export const runtime = "nodejs";

const TIMESERIES_DAYS = 14;
/** Windows the Insights range control offers; anything else falls back to 14. */
const ALLOWED_DAYS = new Set([7, 14, 30]);

type DayPoint = { day: string; count: number };

/** UTC midnight that opens a trailing window of `days` days (today included). */
function windowStart(days: number): string {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));
    return since.toISOString();
}

/**
 * The series are queried over twice the window (oldest first), so one query
 * per series answers both "this period" and "the period before" - the
 * comparison Home and Insights put into words ("up 18% on the previous 14 days").
 */
function splitWindow(points: DayPoint[], days: number): { current: DayPoint[]; previousTotal: number } {
    const cut = Math.max(0, points.length - days);
    return {
        current: points.slice(cut),
        previousTotal: points.slice(0, cut).reduce((total, point) => total + point.count, 0),
    };
}

/** WorkspaceUsagePeriod.periodStart for the current UTC month. */
function currentPeriodStart(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Plan usage = the metered quantity the plan actually limits: messages
 * reserved against the monthly delivery allowance, next to that allowance
 * (null = unlimited). Workspace-wide by nature, even on a campaign page.
 */
async function planUsage(repository: AutomationRepository, workspaceId: string) {
    const [usage, monthlyDeliveryLimit] = await Promise.all([
        repository.getWorkspaceUsage(workspaceId, currentPeriodStart()),
        getEntitlementService().getMonthlyDeliveryLimit(workspaceId).catch(() => null),
    ]);
    return { deliveriesThisMonth: usage.deliveriesReserved, monthlyDeliveryLimit };
}

// GET /api/insights?automationId=<optional>&include=usage|overview&days=7|14|30
// Funnel counts over the participant lifecycle, a daily time series (14 days
// unless `days` asks for 7 or 30) with the previous window's totals, per-post
// performance for link analytics, and per-automation send outcomes.
//
// `include` narrows the work to what the caller actually renders, because every
// omitted field is a database query saved on a page that is waiting to paint:
//   usage    - plan usage only (the campaign activity sidebar, Home's limit check).
//   overview - the series, previous-window totals and captured/opted-out totals
//              (Home). Skips the funnel, per-post performance, per-automation
//              outcomes and the usage count, none of which the dashboard displays.
//   (absent) - everything, for the full insights surface.
export async function GET(request: Request) {
    const session = await getValidatedSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const repository = getRepository();
    const params = new URL(request.url).searchParams;
    const automationId = params.get("automationId") ?? undefined;
    if (automationId && !await repository.getAutomation(session.workspaceId, automationId)) {
        return NextResponse.json({ error: "Automation not found" }, { status: 404 });
    }

    const include = params.get("include");

    if (include === "usage") {
        return NextResponse.json({ usage: await planUsage(repository, session.workspaceId) });
    }

    // Contacts are workspace records with no automation column, so these two
    // totals cannot be narrowed to one automation; the response says so
    // instead of letting a campaign view present them as its own.
    const contactTotalsScope = "workspace" as const;
    const requestedDays = Number(params.get("days"));
    const days = ALLOWED_DAYS.has(requestedDays) ? requestedDays : TIMESERIES_DAYS;

    if (include === "overview") {
        const [participantsSeries, sentSeries, capturedEmails, optedOut] = await Promise.all([
            repository.countParticipantsPerDay(session.workspaceId, days * 2, automationId),
            repository.countExecutionsSentPerDay(session.workspaceId, days * 2, automationId),
            repository.countCapturedContacts(session.workspaceId),
            repository.countSuppressedContacts(session.workspaceId),
        ]);
        const participants = splitWindow(participantsSeries, days);
        const sent = splitWindow(sentSeries, days);
        return NextResponse.json({
            timeseries: { days, participantsPerDay: participants.current, sentPerDay: sent.current },
            previous: { sent: sent.previousTotal, reached: participants.previousTotal },
            capturedEmails,
            optedOut,
            contactTotalsScope,
        });
    }

    const [funnel, journey, participantsSeries, sentSeries, mediaPerformance, outcomes, capturedEmails, optedOut, usage] = await Promise.all([
        repository.countParticipantsByState(session.workspaceId, automationId || undefined),
        repository.countParticipantFunnel(session.workspaceId, automationId),
        repository.countParticipantsPerDay(session.workspaceId, days * 2, automationId),
        repository.countExecutionsSentPerDay(session.workspaceId, days * 2, automationId),
        repository.countParticipantsByMedia(session.workspaceId, automationId),
        repository.countExecutionsByStatusPerAutomation(session.workspaceId, windowStart(days)),
        repository.countCapturedContacts(session.workspaceId),
        repository.countSuppressedContacts(session.workspaceId),
        planUsage(repository, session.workspaceId),
    ]);
    const participants = splitWindow(participantsSeries, days);
    const sent = splitWindow(sentSeries, days);

    return NextResponse.json({
        funnel,
        // Cumulative "reached at least this step" counts. `funnel` above is
        // where each person is right now, which doesn't read as a funnel.
        journey,
        timeseries: { days, participantsPerDay: participants.current, sentPerDay: sent.current },
        previous: { sent: sent.previousTotal, reached: participants.previousTotal },
        // Send outcomes per automation inside the same window as the series.
        automations: outcomes.filter((row) => !automationId || row.automationId === automationId),
        mediaPerformance: mediaPerformance
            .sort((a, b) => b.matched - a.matched)
            .slice(0, 10),
        capturedEmails,
        optedOut,
        contactTotalsScope,
        usage,
    });
}
