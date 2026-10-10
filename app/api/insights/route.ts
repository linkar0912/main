import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import type { AutomationRepository } from "@/src/lib/repository";
import { getEntitlementService } from "@/src/lib/entitlements/service";

export const runtime = "nodejs";

const TIMESERIES_DAYS = 14;

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

// GET /api/insights?automationId=<optional>&include=usage|overview
// Funnel counts over the participant lifecycle, a 14-day time series, and
// per-post performance for link analytics.
//
// `include` narrows the work to what the caller actually renders, because every
// omitted field is a database query saved on a page that is waiting to paint:
//   usage    - plan usage only (the campaign activity sidebar).
//   overview - the 14-day series plus captured/opted-out totals (Home). Skips
//              the funnel, per-post performance, and the usage count, none of
//              which the dashboard displays.
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

    if (include === "overview") {
        const [participantsPerDay, sentPerDay, capturedEmails, optedOut] = await Promise.all([
            repository.countParticipantsPerDay(session.workspaceId, TIMESERIES_DAYS, automationId),
            repository.countExecutionsSentPerDay(session.workspaceId, TIMESERIES_DAYS, automationId),
            repository.countCapturedContacts(session.workspaceId),
            repository.countSuppressedContacts(session.workspaceId),
        ]);
        return NextResponse.json({
            timeseries: { days: TIMESERIES_DAYS, participantsPerDay, sentPerDay },
            capturedEmails,
            optedOut,
            contactTotalsScope,
        });
    }

    const [funnel, participantsPerDay, sentPerDay, mediaPerformance, capturedEmails, optedOut, usage] = await Promise.all([
        repository.countParticipantsByState(session.workspaceId, automationId || undefined),
        repository.countParticipantsPerDay(session.workspaceId, TIMESERIES_DAYS, automationId),
        repository.countExecutionsSentPerDay(session.workspaceId, TIMESERIES_DAYS, automationId),
        repository.countParticipantsByMedia(session.workspaceId, automationId),
        repository.countCapturedContacts(session.workspaceId),
        repository.countSuppressedContacts(session.workspaceId),
        planUsage(repository, session.workspaceId),
    ]);

    return NextResponse.json({
        funnel,
        timeseries: { days: TIMESERIES_DAYS, participantsPerDay, sentPerDay },
        mediaPerformance: mediaPerformance
            .sort((a, b) => b.matched - a.matched)
            .slice(0, 10),
        capturedEmails,
        optedOut,
        contactTotalsScope,
        usage,
    });
}

