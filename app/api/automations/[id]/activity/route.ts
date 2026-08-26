import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import type { AutomationParticipantRecord } from "@/src/lib/repository";
import {
  computeFunnelSummary,
  type ParticipantActivitySummary,
  type ParticipantFunnelSummary,
} from "@/src/lib/automation/activity-summary";

export const runtime = "nodejs";

const PARTICIPANT_ACTIVITY_LIMIT = 100;

type RouteContext = { params: Promise<{ id: string }> };

export type { ParticipantActivitySummary, ParticipantFunnelSummary };
export { computeFunnelSummary };

function toActivitySummary(participant: AutomationParticipantRecord): ParticipantActivitySummary {
  const {
    id,
    sourceMediaSnapshot,
    matchedKeyword,
    state,
    followStatus,
    followCheckedAt,
    publicReplyStatus,
    publicReplyError,
    openingStatus,
    openingError,
    finalDeliveryStatus,
    finalDeliveryError,
    finalDeliveredAt,
    deliveryClickedAt,
    variantLabel,
    createdAt,
  } = participant;
  return {
    id,
    sourceMediaSnapshot,
    matchedKeyword,
    state,
    followStatus,
    followCheckedAt,
    publicReplyStatus,
    publicReplyError,
    openingStatus,
    openingError,
    finalDeliveryStatus,
    finalDeliveryError,
    finalDeliveredAt,
    deliveryClickedAt,
    variantLabel,
    createdAt,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const repository = getRepository();
  const automation = await repository.getAutomation(session.workspaceId, id);
  if (!automation) return NextResponse.json({ error: "Automation not found" }, { status: 404 });

  const [participants, summary] = await Promise.all([
    repository.listParticipants(session.workspaceId, id, PARTICIPANT_ACTIVITY_LIMIT),
    repository.countParticipantFunnel(session.workspaceId, id),
  ]);
  return NextResponse.json({
    data: participants.map(toActivitySummary),
    summary,
  });
}
