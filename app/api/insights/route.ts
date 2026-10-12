import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import type { AutomationRecord, AutomationRepository } from "@/src/lib/repository";
import { collectsEmail } from "@/src/lib/automation-analytics";
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

type FunnelCounts = Awaited<ReturnType<AutomationRepository["countParticipantFunnel"]>>;

function minusFunnel(wide: FunnelCounts, recent: FunnelCounts): FunnelCounts {
    return {
        commented: Math.max(0, wide.commented - recent.commented),
        openingSent: Math.max(0, wide.openingSent - recent.openingSent),
        optedIn: Math.max(0, wide.optedIn - recent.optedIn),
        followed: Math.max(0, wide.followed - recent.followed),
        linkSent: Math.max(0, wide.linkSent - recent.linkSent),
    };
}

/**
 * include=automation: the series, this automation's send outcomes, its
 * comment-to-link funnel and per-post numbers - all for people and sends
 * inside the window - and the same totals for the window before. Each
 * "previous" figure is (twice the window) minus (the window), so one extra
 * query per measure answers both.
 */
async function automationAnalytics(repository: AutomationRepository, workspaceId: string, automation: AutomationRecord, days: number) {
    const automationId = automation.id;
    const since = windowStart(days);
    const sinceBefore = windowStart(days * 2);
    // Email-capture automations also count people messaged, asked and
    // captured; nothing else has those steps, so nothing else pays for them.
    const capturing = collectsEmail(automation);
    const [[captureNow, captureWide], participantsSeries, sentSeries, outcomesNow, outcomesWide, funnelNow, funnelWide, mediaNow, mediaWide] = await Promise.all([
        capturing
            ? Promise.all([
                repository.countEmailCaptureFunnel(workspaceId, automationId, since),
                repository.countEmailCaptureFunnel(workspaceId, automationId, sinceBefore),
            ])
            : Promise.resolve([null, null] as const),
        repository.countParticipantsPerDay(workspaceId, days * 2, automationId),
        repository.countExecutionsSentPerDay(workspaceId, days * 2, automationId),
        repository.countExecutionsByStatusPerAutomation(workspaceId, since),
        repository.countExecutionsByStatusPerAutomation(workspaceId, sinceBefore),
        repository.countParticipantFunnel(workspaceId, automationId, since),
        repository.countParticipantFunnel(workspaceId, automationId, sinceBefore),
        repository.countParticipantsByMedia(workspaceId, automationId, since),
        repository.countParticipantsByMedia(workspaceId, automationId, sinceBefore),
    ]);
    const participants = splitWindow(participantsSeries, days);
    const sent = splitWindow(sentSeries, days);
    const empty = { sent: 0, failed: 0, skipped: 0 };
    const pick = (rows: typeof outcomesNow) => {
        const row = rows.find((candidate) => candidate.automationId === automationId);
        return row ? { sent: row.sent, failed: row.failed, skipped: row.skipped } : empty;
    };
    const outcome = pick(outcomesNow);
    const outcomeWide = pick(outcomesWide);
    const clicks = mediaNow.reduce((total, row) => total + row.clicked, 0);
    const clicksWide = mediaWide.reduce((total, row) => total + row.clicked, 0);
    return {
        timeseries: { days, participantsPerDay: participants.current, sentPerDay: sent.current },
        outcome,
        journey: funnelNow,
        clicks,
        mediaPerformance: mediaNow.sort((a, b) => b.matched - a.matched).slice(0, 5),
        capture: captureNow,
        previous: {
            sent: sent.previousTotal,
            reached: participants.previousTotal,
            failed: Math.max(0, outcomeWide.failed - outcome.failed),
            clicks: Math.max(0, clicksWide - clicks),
            captured: captureNow && captureWide ? Math.max(0, captureWide.captured - captureNow.captured) : 0,
            journey: minusFunnel(funnelWide, funnelNow),
        },
    };
}

// GET /api/insights?automationId=<optional>&include=usage|overview|automation&days=7|14|30
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
//   automation - one automation's analytics (requires automationId): series,
//              outcomes, funnel, clicks and top posts inside the window, with
//              the previous window's totals; for email-capture automations
//              also the people messaged, asked and captured (`capture`). No
//              workspace-wide contact totals.
//   (absent) - everything, for the full insights surface.
export async function GET(request: Request) {
    const session = await getValidatedSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const repository = getRepository();
    const params = new URL(request.url).searchParams;
    const automationId = params.get("automationId") ?? undefined;
    const automation = automationId ? await repository.getAutomation(session.workspaceId, automationId) : null;
    if (automationId && !automation) {
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

    if (include === "automation") {
        // One automation's analytics view (its Overview tab). Everything is
        // inside the chosen window, plus the window before it for the
        // "up 18% on the previous 7 days" lines.
        if (!automation) return NextResponse.json({ error: "automationId is required" }, { status: 400 });
        return NextResponse.json(await automationAnalytics(repository, session.workspaceId, automation, days));
    }

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
