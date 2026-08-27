import { NextResponse } from "next/server";
import { logger } from "@/src/lib/logger";
import { getRepository } from "@/src/lib/repository-provider";
import { isSafeOutboundUrl } from "@/src/lib/security/outbound-url";

export const runtime = "nodejs";

const PARTICIPANT_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

/**
 * GET /api/t/<participantId> - public click-tracking redirect. Delivery DMs
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

    // Only participants that have actually been delivered the link can be
    // counted as a click. EXPIRED / FAILED rows are still looked up by the
    // DM URL the workspace sent earlier, so without this guard an attacker
    // could keep incrementing deliveryClickedAt on a campaign that is no
    // longer running.
    if (participant.state !== "LINK_SENT") return new Response("Not found", { status: 404 });

    const automation = await repository.getAutomation(participant.workspaceId, participant.automationId);
    if (!automation) return new Response("Not found", { status: 404 });
    const definition = automation.definition;
    const targetUrl = definition.version === 2 ? definition.delivery.url : null;
    if (!targetUrl) return new Response("Not found", { status: 404 });

    // Treat the same outbound-URL contract as the rest of the app: a definition
    // that was edited (or compromised) to a javascript:/data:/private address
    // must never reach the browser. If validation fails we log and 404 instead
    // of bouncing the visitor to an unverified destination.
    if (!isSafeOutboundUrl(targetUrl)) {
        logger.warn("Rejected unsafe delivery redirect", {
            participantId: id,
            automationId: participant.automationId,
            workspaceId: participant.workspaceId,
        });
        return new Response("Not found", { status: 404 });
    }

    // First click wins; repeat taps still forward but do not double-count.
    const recorded = await repository.markDeliveryClicked(id, new Date().toISOString());
    if (recorded) {
        logger.info("delivery link clicked", {
            participantId: id,
            automationId: participant.automationId,
            workspaceId: participant.workspaceId,
            automationStatus: automation.status,
        });
    } else if (automation.status !== "ACTIVE") {
        // Detect lingering clicks against a paused / draft campaign. The
        // visitor still gets redirected (the message was sent earlier and
        // cannot be recalled), but the log line lets operators see that a
        // pause did not stop a follow-up click.
        logger.info("delivery link clicked after automation was paused", {
            participantId: id,
            automationId: participant.automationId,
            workspaceId: participant.workspaceId,
            automationStatus: automation.status,
        });
    }

    return NextResponse.redirect(targetUrl, 302);
}
