import { NextResponse } from "next/server";
import { logger } from "@/src/lib/logger";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

const PARTICIPANT_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

/**
 * GET /api/t/<participantId> — public click-tracking redirect. Delivery DMs
 * link here instead of the target URL; the first tap records `deliveryClickedAt`
 * and every tap forwards to the automation's real delivery link. The
 * participant id doubles as the capability token (unguessable random id).
 */
export async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> },
) {
    const { id } = await context.params;
    if (!PARTICIPANT_ID_PATTERN.test(id)) {
        return new Response("Not found", { status: 404 });
    }

    const repository = getRepository();
    const participant = await repository.getParticipantById(id);
    if (!participant) return new Response("Not found", { status: 404 });

    const automation = await repository.getAutomation(participant.workspaceId, participant.automationId);
    const definition = automation?.definition;
    const targetUrl = definition?.version === 2 ? definition.delivery.url : null;
    if (!targetUrl) return new Response("Not found", { status: 404 });

    // First click wins; repeat taps still forward but do not double-count.
    const recorded = await repository.markDeliveryClicked(id, new Date().toISOString());
    if (recorded) {
        logger.info("delivery link clicked", {
            participantId: id,
            automationId: participant.automationId,
            workspaceId: participant.workspaceId,
        });
    }

    return NextResponse.redirect(targetUrl, 302);
}
