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

export type FacebookPageActivitySummary = {
  id: string;
  provider: "FACEBOOK";
  surface: "COMMENT";
  connectionName: string;
  eventType: "comment.created";
  result: "PROCESSING" | "SENT" | "SKIPPED" | "FAILED";
  safeErrorCode?: string;
  replyPreview?: string;
  createdAt: string;
};

const SAFE_FACEBOOK_ACTIVITY_CODES = new Set([
  "permission_missing",
  "connection_unhealthy",
  "invalid_channel_definition",
  "facebook_api_error",
  "facebook_delivery_failed",
  "daily_send_limit",
  "outside scheduled window",
  "replyOncePerUser is set and this sender already received a reply",
]);

function safeFacebookActivityCode(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  return SAFE_FACEBOOK_ACTIVITY_CODES.has(reason) ? reason : "delivery_failed";
}

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

  if (automation.provider === "FACEBOOK" || automation.facebookPageId) {
    const [executions, pages] = await Promise.all([
      repository.listAutomationExecutions(session.workspaceId, id, PARTICIPANT_ACTIVITY_LIMIT),
      repository.listFacebookPages(session.workspaceId),
    ]);
    const connectionName = pages.find((page) => page.pageId === automation.facebookPageId)?.pageName ?? "Facebook Page";
    const data: FacebookPageActivitySummary[] = executions.map((execution) => {
      const replyPreview = execution.status === "SENT" && execution.reason?.startsWith("reply:")
        ? execution.reason.slice("reply:".length)
        : undefined;
      const safeErrorCode = execution.status === "FAILED" || execution.status === "SKIPPED"
        ? safeFacebookActivityCode(execution.reason)
        : undefined;
      return {
        id: execution.id,
        provider: "FACEBOOK",
        surface: "COMMENT",
        connectionName,
        eventType: "comment.created",
        result: execution.status,
        ...(safeErrorCode ? { safeErrorCode } : {}),
        ...(replyPreview ? { replyPreview } : {}),
        createdAt: execution.createdAt,
      };
    });
    return NextResponse.json({
      channel: { provider: "FACEBOOK", surface: "COMMENT", connectionName },
      data,
      summary: {
        total: data.length,
        sent: data.filter((item) => item.result === "SENT").length,
        skipped: data.filter((item) => item.result === "SKIPPED").length,
        failed: data.filter((item) => item.result === "FAILED").length,
      },
    });
  }

  const [participants, summary] = await Promise.all([
    repository.listParticipants(session.workspaceId, id, PARTICIPANT_ACTIVITY_LIMIT),
    repository.countParticipantFunnel(session.workspaceId, id),
  ]);
  return NextResponse.json({
    data: participants.map(toActivitySummary),
    summary,
  });
}
