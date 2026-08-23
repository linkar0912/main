import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import type { AutomationParticipantRecord } from "@/src/lib/repository";

export const runtime = "nodejs";

const PARTICIPANT_ACTIVITY_LIMIT = 100;

type RouteContext = { params: Promise<{ id: string }> };

export type ParticipantActivitySummary = Pick<
  AutomationParticipantRecord,
  | "id"
  | "state"
  | "sourceMediaSnapshot"
  | "matchedKeyword"
  | "followStatus"
  | "followCheckedAt"
  | "publicReplyStatus"
  | "publicReplyError"
  | "openingStatus"
  | "openingError"
  | "finalDeliveryStatus"
  | "finalDeliveryError"
  | "finalDeliveredAt"
  | "deliveryClickedAt"
>;

export type ParticipantFunnelSummary = {
  commented: number;
  openingSent: number;
  optedIn: number;
  followed: number;
  linkSent: number;
};

const OPTED_IN_OR_LATER = new Set(["OPTED_IN", "FOLLOW_REQUIRED", "FOLLOW_VERIFIED", "LINK_SENT"]);
const FOLLOWED_STATES = new Set(["FOLLOW_VERIFIED", "LINK_SENT"]);

export function computeFunnelSummary(participants: Pick<AutomationParticipantRecord, "state" | "openingStatus" | "followStatus" | "finalDeliveryStatus">[]): ParticipantFunnelSummary {
  let openingSent = 0;
  let optedIn = 0;
  let followed = 0;
  let linkSent = 0;
  for (const participant of participants) {
    if (participant.openingStatus === "SENT") openingSent += 1;
    if (OPTED_IN_OR_LATER.has(participant.state)) optedIn += 1;
    if (participant.followStatus === true || FOLLOWED_STATES.has(participant.state)) followed += 1;
    if (participant.finalDeliveryStatus === "SENT") linkSent += 1;
  }
  return { commented: participants.length, openingSent, optedIn, followed, linkSent };
}

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
