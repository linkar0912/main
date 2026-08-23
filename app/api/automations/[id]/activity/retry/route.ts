import { NextResponse } from "next/server";
import { processNormalizedEvent } from "@/src/lib/automation/runner";
import type { NormalizedEvent } from "@/src/lib/automation/types";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { createId } from "@/src/lib/id";
import { MetaClient } from "@/src/lib/meta/client";
import { enqueueWebhookEvents } from "@/src/lib/queue";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/automations/:id/activity/retry  { participantId }
// Re-arms a FAILED participant and runs it through the campaign state machine
// again. Only failed participants qualify, and only while their 24h messaging
// window is still open and the campaign is ACTIVE - otherwise the retry would
// deterministically fail again.
export async function POST(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: automationId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { participantId?: unknown };
  if (typeof body.participantId !== "string") {
    return NextResponse.json({ error: "participantId is required" }, { status: 400 });
  }

  const repository = getRepository();
  const automation = await repository.getAutomation(session.workspaceId, automationId);
  if (!automation) return NextResponse.json({ error: "Automation not found" }, { status: 404 });

  const participant = await repository.getParticipantById(body.participantId);
  if (!participant || participant.workspaceId !== session.workspaceId || participant.automationId !== automationId) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }
  if (participant.state !== "FAILED") {
    return NextResponse.json({ error: "Only failed participants can be retried." }, { status: 409 });
  }
  const windowExpired =
    participant.messagingWindowExpiresAt !== undefined &&
    new Date(participant.messagingWindowExpiresAt).getTime() <= Date.now();
  if (windowExpired) {
    return NextResponse.json({ error: "The messaging window for this participant has closed." }, { status: 409 });
  }
  if (automation.status !== "ACTIVE") {
    return NextResponse.json({ error: "Activate this campaign before retrying." }, { status: 409 });
  }

  // Re-arm: clear every action's result so the runner replays the full journey.
  const updated = await repository.transitionParticipant(participant.id, ["FAILED"], {
    state: "COMMENT_MATCHED",
    publicReplyStatus: "PENDING",
    publicReplyError: undefined,
    openingStatus: "PENDING",
    openingError: undefined,
    finalDeliveryStatus: "PENDING",
    finalDeliveryError: undefined,
  });

  // A fresh event id bypasses webhook dedupe while sourceCommentId keeps it
  // linked to the same Instagram comment.
  const event: NormalizedEvent = {
    id: createId("evt"),
    accountId: participant.instagramAccountId,
    type: "comment.created",
    text: participant.matchedKeyword ?? "",
    commentId: participant.sourceCommentId,
    mediaId: participant.sourceMediaId,
    timestamp: Date.now(),
  };

  const env = getServerEnv();
  const enqueued = await enqueueWebhookEvents([event]);
  if (enqueued === 0) {
    // No Redis queue (self-hosted): process inline exactly like the Meta webhook does.
    const client = env.metaAppId ? new MetaClient({ apiVersion: env.metaApiVersion }) : undefined;
    try {
      await processNormalizedEvent(event, repository, {
        client,
        tokenEncryptionKey: env.metaTokenEncryptionKey,
        interactionSecret: env.metaAppSecret,
        campaignsEnabled: env.followGatedCampaignsEnabled,
        dispatchLeaseMs: env.dispatchLeaseMs,
      });
    } catch (error) {
      // The state machine records its own failure; surface retried=true either way.
      console.warn("Retry processing failed", error instanceof Error ? error.message : String(error));
    }
  }

  return NextResponse.json({
    data: {
      retried: true,
      delivered: updated ? updated.finalDeliveryStatus !== "PENDING" : false,
    },
  });
}
