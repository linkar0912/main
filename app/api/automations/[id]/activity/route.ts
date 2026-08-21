import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getOwnerSessionFromRequest } from "@/src/lib/auth/session";
import type { AutomationParticipantRecord } from "@/src/lib/repository";

export const runtime = "nodejs";

const PARTICIPANT_ACTIVITY_LIMIT = 100;

type RouteContext = { params: Promise<{ id: string }> };

export type ParticipantActivitySummary = Pick<
  AutomationParticipantRecord,
  | "sourceMediaSnapshot"
  | "matchedKeyword"
  | "state"
  | "followStatus"
  | "followCheckedAt"
  | "publicReplyStatus"
  | "publicReplyError"
  | "openingStatus"
  | "openingError"
  | "finalDeliveryStatus"
  | "finalDeliveryError"
  | "finalDeliveredAt"
>;

function toActivitySummary(participant: AutomationParticipantRecord): ParticipantActivitySummary {
  const {
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
  } = participant;
  return {
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
  };
}

export async function GET(request: Request, context: RouteContext) {
  const session = getOwnerSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const repository = getRepository();
  const automation = await repository.getAutomation(session.workspaceId, id);
  if (!automation) return NextResponse.json({ error: "Automation not found" }, { status: 404 });

  const participants = await repository.listParticipants(session.workspaceId, id, PARTICIPANT_ACTIVITY_LIMIT);
  return NextResponse.json({ data: participants.map(toActivitySummary) });
}
