import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

const TIMESERIES_DAYS = 14;

function startOfMonthIso(): string {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
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
        // No paid tiers are modeled yet, so monthlyLimit stays null (unlimited).
        return NextResponse.json({
            usage: {
                participantsThisMonth: await repository.countParticipantsCreatedSince(session.workspaceId, startOfMonthIso()),
                monthlyLimit: null as number | null,
            },
        });
    }

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
        });
    }

    const [funnel, participantsPerDay, sentPerDay, mediaPerformance, capturedEmails, optedOut, participantsThisMonth] = await Promise.all([
        repository.countParticipantsByState(session.workspaceId, automationId || undefined),
        repository.countParticipantsPerDay(session.workspaceId, TIMESERIES_DAYS, automationId),
        repository.countExecutionsSentPerDay(session.workspaceId, TIMESERIES_DAYS, automationId),
        repository.countParticipantsByMedia(session.workspaceId, automationId),
        repository.countCapturedContacts(session.workspaceId),
        repository.countSuppressedContacts(session.workspaceId),
        repository.countParticipantsCreatedSince(session.workspaceId, startOfMonthIso()),
    ]);

    return NextResponse.json({
        funnel,
        timeseries: { days: TIMESERIES_DAYS, participantsPerDay, sentPerDay },
        mediaPerformance: mediaPerformance
            .sort((a, b) => b.matched - a.matched)
            .slice(0, 10),
        capturedEmails,
        optedOut,
        usage: { participantsThisMonth, monthlyLimit: null as number | null },
    });
}

