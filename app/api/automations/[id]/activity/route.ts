import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { MetaClient } from "@/src/lib/meta/client";
import type { AutomationParticipantRecord } from "@/src/lib/repository";
import { unsealSecret } from "@/src/lib/security/secrets";
import {
  computeFunnelSummary,
  type ParticipantActivitySummary,
  type ParticipantFunnelSummary,
} from "@/src/lib/automation/activity-summary";

export const runtime = "nodejs";

const PARTICIPANT_ACTIVITY_LIMIT = 100;
const PROFILE_LOOKUP_LIMIT = 25;

type RouteContext = { params: Promise<{ id: string }> };

export type FacebookPageActivitySummary = {
  id: string;
  provider: "FACEBOOK";
  surface: "COMMENT";
  connectionName: string;
  eventType: "comment.created";
  result: "PROCESSING" | "SENT" | "SKIPPED" | "FAILED";
  authorName?: string;
  commentPreview?: string;
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

function toActivitySummary(
  participant: AutomationParticipantRecord,
  instagramUsername?: string,
): ParticipantActivitySummary {
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
    ...(instagramUsername ? { instagramUsername } : {}),
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
    const [executions, pages, commentEvents] = await Promise.all([
      repository.listAutomationExecutions(session.workspaceId, id, PARTICIPANT_ACTIVITY_LIMIT),
      repository.listFacebookPages(session.workspaceId),
      repository.listRecentWebhookEvents(session.workspaceId, PARTICIPANT_ACTIVITY_LIMIT * 5, "facebook.comment.created"),
    ]);
    const connectionName = pages.find((page) => page.pageId === automation.facebookPageId)?.pageName ?? "Facebook Page";
    const commentsByEventId = new Map(commentEvents.map((event) => [event.providerEventId, event]));
    const data: FacebookPageActivitySummary[] = executions.map((execution) => {
      const commentEvent = execution.externalEventId ? commentsByEventId.get(execution.externalEventId) : undefined;
      const authorName = typeof commentEvent?.payload.senderName === "string"
        ? commentEvent.payload.senderName.trim().slice(0, 80)
        : undefined;
      const commentPreview = typeof commentEvent?.payload.text === "string"
        ? commentEvent.payload.text.trim().slice(0, 240)
        : undefined;
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
        ...(authorName ? { authorName } : {}),
        ...(commentPreview ? { commentPreview } : {}),
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

  const [participants, summary, commentEvents] = await Promise.all([
    repository.listParticipants(session.workspaceId, id, PARTICIPANT_ACTIVITY_LIMIT),
    repository.countParticipantFunnel(session.workspaceId, id),
    repository.listRecentWebhookEvents(session.workspaceId, PARTICIPANT_ACTIVITY_LIMIT * 5, "comment.created"),
  ]);
  const usernamesByCommentId = new Map<string, string>();
  for (const event of commentEvents) {
    const commentId = typeof event.payload.commentId === "string" ? event.payload.commentId : undefined;
    const username = typeof event.payload.senderUsername === "string"
      ? event.payload.senderUsername.trim().replace(/^@+/, "").slice(0, 60)
      : "";
    if (commentId && username && !usernamesByCommentId.has(commentId)) {
      usernamesByCommentId.set(commentId, username);
    }
  }

  const unresolved = participants.filter((participant) =>
    participant.igScopedUserId && !usernamesByCommentId.has(participant.sourceCommentId));
  if (unresolved.length > 0) {
    const env = getServerEnv();
    if (env.metaTokenEncryptionKey) {
      const connections = await repository.listConnections(session.workspaceId);
      const connectionsByAccountId = new Map(connections.map((connection) => [connection.igUserId, connection]));
      const client = new MetaClient({ apiVersion: env.metaApiVersion });
      const profileLookups = new Map<string, Promise<string | undefined>>();

      for (const participant of unresolved.slice(0, PROFILE_LOOKUP_LIMIT)) {
        const scopedUserId = participant.igScopedUserId;
        const connection = connectionsByAccountId.get(participant.instagramAccountId);
        if (!scopedUserId || !connection || connection.status !== "CONNECTED") continue;
        const lookupKey = `${participant.instagramAccountId}:${scopedUserId}`;
        let lookup = profileLookups.get(lookupKey);
        if (!lookup) {
          lookup = client.getUserProfile({
            igUserId: connection.igUserId,
            accessToken: unsealSecret(connection.accessTokenEncrypted, env.metaTokenEncryptionKey),
          }, scopedUserId)
            .then(({ username }) => username.trim().replace(/^@+/, "").slice(0, 60) || undefined)
            .catch(() => undefined);
          profileLookups.set(lookupKey, lookup);
        }
        const username = await lookup;
        if (username) usernamesByCommentId.set(participant.sourceCommentId, username);
      }
    }
  }

  return NextResponse.json({
    data: participants.map((participant) =>
      toActivitySummary(participant, usernamesByCommentId.get(participant.sourceCommentId))),
    summary,
  });
}
