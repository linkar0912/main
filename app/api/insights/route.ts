import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

const MONTHLY_LIMIT = Number(process.env.PLAN_MONTHLY_PARTICIPANT_LIMIT ?? 500);

// GET /api/insights?automationId=<optional>
// Funnel counts over the participant lifecycle plus current-month plan usage.
export async function GET(request: Request) {
    const session = await getValidatedSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const repository = getRepository();
    const automationId = new URL(request.url).searchParams.get("automationId") ?? undefined;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const [funnel, participantsThisMonth] = await Promise.all([
        repository.countParticipantsByState(session.workspaceId, automationId || undefined),
        repository.countParticipantsCreatedSince(session.workspaceId, monthStart),
    ]);

    return NextResponse.json({
        funnel,
        usage: {
            participantsThisMonth,
            monthlyLimit: Number.isFinite(MONTHLY_LIMIT) && MONTHLY_LIMIT > 0 ? MONTHLY_LIMIT : null,
        },
    });
}