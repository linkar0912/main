import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

const TIMESERIES_DAYS = 14;

// GET /api/insights?automationId=<optional>
// Funnel counts over the participant lifecycle, a 14-day time series, and
// per-post performance for link analytics.
export async function GET(request: Request) {
    const session = await getValidatedSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const repository = getRepository();
    const automationId = new URL(request.url).searchParams.get("automationId") ?? undefined;
    const [funnel, participantsPerDay, sentPerDay, mediaPerformance] = await Promise.all([
        repository.countParticipantsByState(session.workspaceId, automationId || undefined),
        repository.countParticipantsPerDay(session.workspaceId, TIMESERIES_DAYS),
        repository.countExecutionsSentPerDay(session.workspaceId, TIMESERIES_DAYS),
        repository.countParticipantsByMedia(session.workspaceId),
    ]);

    return NextResponse.json({
        funnel,
        timeseries: { days: TIMESERIES_DAYS, participantsPerDay, sentPerDay },
        mediaPerformance: mediaPerformance
            .sort((a, b) => b.matched - a.matched)
            .slice(0, 10),
    });
}