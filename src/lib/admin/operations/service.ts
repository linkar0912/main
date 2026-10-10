import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { validateFlowDefinition } from "@/src/lib/automation/definition";
import { getServerEnv } from "@/src/lib/env";
import { createId } from "@/src/lib/id";
import { prisma } from "@/src/lib/prisma";
import { enqueueBroadcastSends, enqueueFacebookEvents, enqueueLeadDelivery, enqueueWebhookEvents } from "@/src/lib/queue";
import type { FacebookNormalizedEvent } from "@/src/lib/facebook/types";
import type { NormalizedEvent } from "@/src/lib/automation/types";
import { AdminWorkspaceError } from "../workspace-service";
import type { AdminOperationKind } from "./types";

export const AdminOperationCommandSchema = z.object({
  action: z.string().regex(/^[a-z_]{2,40}$/),
  version: z.number().int().positive(),
  input: z.record(z.string(), z.unknown()).default({}),
}).strict();
export type AdminOperationCommand = z.infer<typeof AdminOperationCommandSchema>;

const allowed: Record<AdminOperationKind, readonly string[]> = {
  automation: ["update", "activate", "pause", "archive", "restore_version"],
  sequence: ["update", "activate", "pause", "archive"], broadcast: ["cancel_pending", "retry_failed"],
  contact: ["update", "suppress", "unsuppress", "delete", "export_one"],
  tracked_link: ["update_destination", "disable", "enable", "delete"],
  delivery: ["retry", "cancel_pending", "release_stale_claim"], webhook: ["reprocess"],
};

async function protectWorkspace(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { status: true, members: { where: { userId: { in: getServerEnv().platformOwnerUserIds } }, select: { userId: true }, take: 1 } } });
  if (!workspace) throw new AdminWorkspaceError(404, "workspace_not_found");
  if (workspace.members.length) throw new AdminWorkspaceError(403, "owner_workspace_protected");
  return workspace;
}

// Snapshot numbers follow the same max+1 sequence user saves use; the
// automation's own `version` is an optimistic-lock counter and can collide.
async function nextSnapshotNumber(tx: Prisma.TransactionClient, automationId: string): Promise<number> {
  const aggregate = await tx.automationVersion.aggregate({ where: { automationId }, _max: { version: true } });
  return (aggregate._max.version ?? 0) + 1;
}
function changed(count: number): void { if (count !== 1) throw new AdminWorkspaceError(409, "stale_version"); }
function stringInput(input: Record<string, unknown>, key: string, max: number): string {
  const value = typeof input[key] === "string" ? input[key].trim() : "";
  if (!value || value.length > max) throw new AdminWorkspaceError(422, `invalid_${key}`);
  return value;
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  const safe = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function executeAdminOperation(kind: AdminOperationKind, id: string, command: AdminOperationCommand, actorUserId: string) {
  if (!allowed[kind].includes(command.action)) throw new AdminWorkspaceError(400, "action_not_allowed");

  if (kind === "automation") {
    const record = await prisma.automation.findUnique({ where: { id } }); if (!record) throw new AdminWorkspaceError(404, "operation_not_found");
    const workspace = await protectWorkspace(record.workspaceId);
    if (record.version !== command.version) throw new AdminWorkspaceError(409, "stale_version");
    if (["activate", "update", "restore_version"].includes(command.action) && workspace.status !== "ACTIVE") throw new AdminWorkspaceError(409, "workspace_inactive");
    if (command.action === "activate") { if (!['DRAFT', 'PAUSED'].includes(record.status) || record.archivedAt) throw new AdminWorkspaceError(409, "invalid_transition"); changed((await prisma.automation.updateMany({ where: { id, version: command.version }, data: { status: "ACTIVE", activatedAt: new Date(), boundMediaId: validateFlowDefinition(record.definition).version === 2 && (record.definition as { trigger?: { source?: string } }).trigger?.source === "next_media" ? null : undefined, version: { increment: 1 } } })).count); }
    else if (command.action === "pause") { if (record.status !== "ACTIVE") throw new AdminWorkspaceError(409, "invalid_transition"); changed((await prisma.automation.updateMany({ where: { id, version: command.version }, data: { status: "PAUSED", version: { increment: 1 } } })).count); }
    else if (command.action === "archive") { changed((await prisma.automation.updateMany({ where: { id, version: command.version }, data: { status: "PAUSED", archivedAt: new Date(), version: { increment: 1 } } })).count); }
    else if (command.action === "update") {
      const name = command.input.name === undefined ? record.name : stringInput(command.input, "name", 120);
      const definition = command.input.definition === undefined ? record.definition : validateFlowDefinition(command.input.definition);
      const validated = validateFlowDefinition(definition);
      const rearm = command.input.definition !== undefined && record.status === "ACTIVE" && validated.version === 2 && validated.trigger.source === "next_media";
      await prisma.$transaction(async (tx) => { const current = await tx.automation.findFirst({ where: { id, version: command.version } }); if (!current) throw new AdminWorkspaceError(409, "stale_version"); await tx.automationVersion.create({ data: { id: createId("automation_version"), automationId: id, workspaceId: record.workspaceId, version: await nextSnapshotNumber(tx, id), provider: record.provider, name: record.name, definition: record.definition as Prisma.InputJsonValue, status: record.status, priority: record.priority, activatedAt: record.activatedAt, boundMediaId: record.boundMediaId, instagramAccountId: record.instagramAccountId, facebookPageId: record.facebookPageId, snapshotBy: actorUserId } }); changed((await tx.automation.updateMany({ where: { id, version: command.version }, data: { name, definition: definition as Prisma.InputJsonValue, ...(rearm ? { boundMediaId: null, activatedAt: new Date() } : {}), version: { increment: 1 } } })).count); });
    } else {
      const versionNumber = z.number().int().positive().parse(command.input.versionNumber);
      const snapshot = await prisma.automationVersion.findUnique({ where: { automationId_version: { automationId: id, version: versionNumber } } }); if (!snapshot) throw new AdminWorkspaceError(404, "version_not_found");
      await prisma.$transaction(async (tx) => { const current = await tx.automation.findFirst({ where: { id, version: command.version } }); if (!current) throw new AdminWorkspaceError(409, "stale_version"); await tx.automationVersion.create({ data: { id: createId("automation_version"), automationId: id, workspaceId: record.workspaceId, version: await nextSnapshotNumber(tx, id), provider: record.provider, name: record.name, definition: record.definition as Prisma.InputJsonValue, status: record.status, priority: record.priority, activatedAt: record.activatedAt, boundMediaId: record.boundMediaId, instagramAccountId: record.instagramAccountId, facebookPageId: record.facebookPageId, snapshotBy: actorUserId } }); changed((await tx.automation.updateMany({ where: { id, version: command.version }, data: { name: snapshot.name, definition: snapshot.definition as Prisma.InputJsonValue, ...(snapshot.provider ? { provider: snapshot.provider } : {}), status: snapshot.status, priority: snapshot.priority, activatedAt: snapshot.activatedAt, boundMediaId: snapshot.boundMediaId, instagramAccountId: snapshot.instagramAccountId, facebookPageId: snapshot.facebookPageId, archivedAt: null, version: { increment: 1 } } })).count); });
    }
    return { id, kind, action: command.action, version: command.version + 1 };
  }

  if (kind === "sequence") {
    const record = await prisma.automationSequence.findUnique({ where: { id } }); if (!record) throw new AdminWorkspaceError(404, "operation_not_found"); const workspace = await protectWorkspace(record.workspaceId);
    if (record.version !== command.version) throw new AdminWorkspaceError(409, "stale_version"); if (["activate", "update"].includes(command.action) && workspace.status !== "ACTIVE") throw new AdminWorkspaceError(409, "workspace_inactive");
    let data: Prisma.AutomationSequenceUpdateManyMutationInput;
    if (command.action === "activate") { if (!['DRAFT', 'PAUSED'].includes(record.status) || record.archivedAt) throw new AdminWorkspaceError(409, "invalid_transition"); data = { status: "ACTIVE" }; }
    else if (command.action === "pause") { if (record.status !== "ACTIVE") throw new AdminWorkspaceError(409, "invalid_transition"); data = { status: "PAUSED" }; }
    else if (command.action === "archive") data = { status: "PAUSED", archivedAt: new Date() };
    else data = { name: command.input.name === undefined ? undefined : stringInput(command.input, "name", 120) };
    changed((await prisma.automationSequence.updateMany({ where: { id, version: command.version }, data: { ...data, version: { increment: 1 } } })).count); return { id, kind, action: command.action, version: command.version + 1 };
  }

  if (kind === "broadcast") {
    const record = await prisma.broadcast.findUnique({ where: { id } }); if (!record) throw new AdminWorkspaceError(404, "operation_not_found"); await protectWorkspace(record.workspaceId);
    if (record.version !== command.version) throw new AdminWorkspaceError(409, "stale_version");
    if (command.action === "cancel_pending") { if (!['PENDING', 'RUNNING'].includes(record.status)) throw new AdminWorkspaceError(409, "invalid_transition"); return prisma.$transaction(async (tx) => { changed((await tx.broadcast.updateMany({ where: { id, version: command.version }, data: { status: "CANCELLED", cancelledAt: new Date(), completedAt: new Date(), version: { increment: 1 } } })).count); const deliveries = await tx.outboundDelivery.updateMany({ where: { broadcastId: id, OR: [{ state: "PENDING" }, { state: "FAILED", retryable: true }] }, data: { state: "CANCELLED", retryable: false, version: { increment: 1 } } }); return { id, kind, action: command.action, cancelled: deliveries.count, version: command.version + 1 }; }); }
    const deliveries = await prisma.outboundDelivery.findMany({ where: { broadcastId: id, state: "FAILED", retryable: true, providerMessageId: null }, select: { id: true, deliveryKey: true, workspaceId: true, broadcastId: true, instagramAccountId: true, recipientId: true, version: true } });
    const valid = deliveries.filter((d): d is typeof d & { broadcastId: string; instagramAccountId: string; recipientId: string } => Boolean(d.broadcastId && d.instagramAccountId && d.recipientId));
    if (!['PENDING', 'RUNNING', 'COMPLETED'].includes(record.status)) throw new AdminWorkspaceError(409, "invalid_transition");
    if (!valid.length) throw new AdminWorkspaceError(409, "not_retryable");
    const reserved = await prisma.$transaction(async (tx) => {
      changed((await tx.broadcast.updateMany({ where: { id, version: command.version, status: record.status }, data: { status: "RUNNING", completedAt: null, version: { increment: 1 } } })).count);
      const selected = [] as typeof valid;
      for (const delivery of valid) {
        const result = await tx.outboundDelivery.updateMany({ where: { id: delivery.id, version: delivery.version, state: "FAILED", retryable: true, providerMessageId: null }, data: { state: "PENDING", retryable: false, version: { increment: 1 } } });
        if (result.count === 1) selected.push(delivery);
      }
      return selected;
    });
    let enqueue;
    try {
      enqueue = await enqueueBroadcastSends(reserved.map((d) => ({ deliveryKey: d.deliveryKey, broadcastId: d.broadcastId, workspaceId: d.workspaceId, igAccountId: d.instagramAccountId, igScopedUserId: d.recipientId })), 0, `broadcast-${id}-${command.version}`);
    } catch {
      enqueue = { accepted: [], rejected: reserved.map((d) => ({ igAccountId: d.instagramAccountId, igScopedUserId: d.recipientId })) };
    }
    const accepted = new Set(enqueue.accepted.map((d) => JSON.stringify([d.igAccountId, d.igScopedUserId])));
    for (const delivery of reserved) {
      if (accepted.has(JSON.stringify([delivery.instagramAccountId, delivery.recipientId]))) continue;
      await prisma.outboundDelivery.updateMany({ where: { id: delivery.id, version: delivery.version + 1, state: "PENDING", providerMessageId: null }, data: { state: "FAILED", retryable: true, version: { increment: 1 } } });
    }
    if (!enqueue.accepted.length) {
      await prisma.broadcast.updateMany({ where: { id, version: command.version + 1, status: "RUNNING" }, data: { status: record.status, completedAt: record.completedAt } });
      throw new AdminWorkspaceError(503, "retry_queue_unavailable");
    }
    return { id, kind, action: command.action, retried: enqueue.accepted.length, rejected: enqueue.rejected.length, version: command.version + 1 };
  }

  if (kind === "contact") {
    const record = await prisma.automationContact.findUnique({ where: { id }, include: { _count: { select: { enrollments: true } } } }); if (!record) throw new AdminWorkspaceError(404, "operation_not_found"); await protectWorkspace(record.workspaceId);
    if (record.version !== command.version) throw new AdminWorkspaceError(409, "stale_version");
    if (command.action === "export_one") { const rows = [["id", "email", "lead_status", "score", "suppressed", "created_at"], [record.id, record.email ?? "", record.leadStatus, record.score, Boolean(record.suppressedAt), record.createdAt.toISOString()]]; return { id, kind, action: command.action, csv: `${rows.map((r) => r.map(csvCell).join(",")).join("\n")}\n` }; }
    if (command.action === "delete") { if (record._count.enrollments) throw new AdminWorkspaceError(409, "contact_history_exists"); changed((await prisma.automationContact.deleteMany({ where: { id, version: command.version } })).count); return { id, kind, action: command.action, deleted: true }; }
    const fields = command.action === "update" ? z.object({ leadStatus: z.enum(["NEW", "ENGAGED", "QUALIFIED", "CUSTOMER"]).optional(), notes: z.string().max(4000).nullable().optional(), assigneeUserId: z.string().min(1).max(128).nullable().optional() }).strict().parse(command.input) : {};
    if (fields.assigneeUserId && !await prisma.workspaceMember.count({ where: { workspaceId: record.workspaceId, userId: fields.assigneeUserId } })) throw new AdminWorkspaceError(422, "assignee_not_in_workspace");
    const data: Prisma.AutomationContactUpdateManyMutationInput = command.action === "suppress" ? { suppressedAt: new Date() } : command.action === "unsuppress" ? { suppressedAt: null } : fields;
    changed((await prisma.automationContact.updateMany({ where: { id, version: command.version }, data: { ...data, version: { increment: 1 } } })).count); return { id, kind, action: command.action, version: command.version + 1 };
  }

  if (kind === "tracked_link") {
    const record = await prisma.trackedLink.findUnique({ where: { id } }); if (!record) throw new AdminWorkspaceError(404, "operation_not_found"); await protectWorkspace(record.workspaceId);
    if (record.version !== command.version) throw new AdminWorkspaceError(409, "stale_version");
    if (command.action === "delete") { changed((await prisma.trackedLink.deleteMany({ where: { id, version: command.version } })).count); return { id, kind, action: command.action, deleted: true }; }
    let data: Prisma.TrackedLinkUpdateManyMutationInput;
    if (command.action === "update_destination") { const destination = stringInput(command.input, "destination", 2048); let url: URL; try { url = new URL(destination); } catch { throw new AdminWorkspaceError(422, "invalid_destination"); } if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new AdminWorkspaceError(422, "invalid_destination"); data = { destination: url.toString() }; }
    else data = { disabledAt: command.action === "disable" ? new Date() : null };
    changed((await prisma.trackedLink.updateMany({ where: { id, version: command.version }, data: { ...data, version: { increment: 1 } } })).count); return { id, kind, action: command.action, version: command.version + 1 };
  }

  if (kind === "delivery") return executeDeliveryCommand(id, command);
  return executeWebhookCommand(id, command);
}

async function executeDeliveryCommand(id: string, command: AdminOperationCommand) {
  const record = await prisma.outboundDelivery.findUnique({ where: { id } }); if (!record) throw new AdminWorkspaceError(404, "operation_not_found"); await protectWorkspace(record.workspaceId);
    if (record.version !== command.version) throw new AdminWorkspaceError(409, "stale_version");
  if (command.action === "cancel_pending") { if (!(record.state === "PENDING" || (record.state === "FAILED" && record.retryable))) throw new AdminWorkspaceError(409, "invalid_transition"); changed((await prisma.outboundDelivery.updateMany({ where: { id, version: command.version, OR: [{ state: "PENDING" }, { state: "FAILED", retryable: true }] }, data: { state: "CANCELLED", retryable: false, version: { increment: 1 } } })).count); }
  else if (command.action === "release_stale_claim") { if (record.state !== "CLAIMED" || !record.claimExpiresAt || record.claimExpiresAt > new Date()) throw new AdminWorkspaceError(409, "claim_active"); changed((await prisma.outboundDelivery.updateMany({ where: { id, version: command.version, state: "CLAIMED", claimExpiresAt: { lte: new Date() } }, data: { state: "UNKNOWN", resultCode: "AMBIGUOUS", claimOwner: null, claimExpiresAt: null, retryable: false, version: { increment: 1 } } })).count); }
  else {
    if (record.providerMessageId || record.state === "SENT") throw new AdminWorkspaceError(409, "already_sent"); if (record.state !== "FAILED" || !record.retryable) throw new AdminWorkspaceError(409, "not_retryable");
    if (!(record.broadcastId && record.instagramAccountId && record.recipientId) && !["LEAD_EMAIL", "LEAD_WEBHOOK"].includes(record.kind)) throw new AdminWorkspaceError(409, "unsupported_delivery_kind");
    changed((await prisma.outboundDelivery.updateMany({ where: { id, version: command.version, state: "FAILED", retryable: true, providerMessageId: null }, data: { state: "PENDING", retryable: false, version: { increment: 1 } } })).count);
    let queued = false;
    try {
    if (record.broadcastId && record.instagramAccountId && record.recipientId) queued = (await enqueueBroadcastSends([{ deliveryKey: record.deliveryKey, broadcastId: record.broadcastId, workspaceId: record.workspaceId, igAccountId: record.instagramAccountId, igScopedUserId: record.recipientId }], 0, `delivery-${id}-${command.version}`)).accepted.length === 1;
    else if (record.kind === "LEAD_EMAIL" || record.kind === "LEAD_WEBHOOK") queued = await enqueueLeadDelivery({ deliveryKey: record.deliveryKey, workspaceId: record.workspaceId, kind: record.kind }, `delivery-${id}-${command.version}`);
    } catch { queued = false; }
    if (!queued) {
      await prisma.outboundDelivery.updateMany({ where: { id, version: command.version + 1, state: "PENDING", providerMessageId: null }, data: { state: "FAILED", retryable: true, version: { increment: 1 } } });
      throw new AdminWorkspaceError(503, "retry_queue_unavailable");
    }
  }
  return { id, kind: "delivery", action: command.action, version: command.version + 1 };
}

async function executeWebhookCommand(id: string, command: AdminOperationCommand) {
  const record = await prisma.webhookEvent.findUnique({ where: { id } }); if (!record) throw new AdminWorkspaceError(404, "operation_not_found"); await protectWorkspace(record.workspaceId);
    if (record.version !== command.version) throw new AdminWorkspaceError(409, "stale_version"); if (record.adminReprocessCount >= 3) throw new AdminWorkspaceError(409, "reprocess_limit_reached");
  const payload = record.payload && typeof record.payload === "object" && !Array.isArray(record.payload) ? record.payload as Record<string, unknown> : {};
  // Historical inbox summaries omitted fields and truncated text. Replaying
  // those summaries could change matching or reopen an expired messaging window.
  if (payload.replayVersion !== 1 || typeof payload.timestamp !== "number" || !Number.isFinite(payload.timestamp)) throw new AdminWorkspaceError(409, "webhook_payload_incomplete");
  const text = typeof payload.text === "string" ? payload.text : "";
  const optional = (key: string) => typeof payload[key] === "string" ? payload[key] as string : undefined;
  let event: NormalizedEvent | FacebookNormalizedEvent;
  let facebook = false;
  if (record.eventType === "facebook.comment.created" && typeof payload.pageId === "string" && typeof payload.commentId === "string" && typeof payload.postId === "string") {
    facebook = true;
    event = { id: record.providerEventId, pageId: payload.pageId, commentId: payload.commentId, postId: payload.postId, text, senderId: optional("senderId"), senderName: optional("senderName"), timestamp: payload.timestamp };
  } else if (typeof payload.accountId === "string" && ["comment.created", "message.received", "quick_reply.received", "postback.received", "optin.received", "referral.received", "story_mention.received"].includes(record.eventType)) {
    event = { id: record.providerEventId, type: record.eventType as NormalizedEvent["type"], accountId: payload.accountId, text, recipientId: optional("recipientId"), senderUsername: optional("senderUsername"), mediaId: optional("mediaId"), commentId: optional("commentId"), storyId: optional("storyId"), interactionPayload: optional("interactionPayload"), attachmentType: optional("attachmentType"), attachmentUrl: optional("attachmentUrl"), timestamp: payload.timestamp };
  } else throw new AdminWorkspaceError(409, "unsupported_webhook_event");
  changed((await prisma.webhookEvent.updateMany({ where: { id, version: command.version, adminReprocessCount: { lt: 3 } }, data: { adminReprocessCount: { increment: 1 }, processedAt: null, version: { increment: 1 } } })).count);
  let enqueued = 0;
  try {
    const retryId = `webhook-${id}-${command.version}`;
    enqueued = facebook ? await enqueueFacebookEvents([event as FacebookNormalizedEvent], retryId) : await enqueueWebhookEvents([event as NormalizedEvent], retryId);
  } catch { enqueued = 0; }
  if (!enqueued) {
    await prisma.webhookEvent.updateMany({ where: { id, version: command.version + 1 }, data: { adminReprocessCount: { decrement: 1 }, processedAt: record.processedAt, version: { increment: 1 } } });
    throw new AdminWorkspaceError(503, "retry_queue_unavailable");
  }
  return { id, kind: "webhook", action: command.action, version: command.version + 1 };
}
