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

function changed(count: number): void { if (count !== 1) throw new AdminWorkspaceError(409, "stale_version"); }
function stringInput(input: Record<string, unknown>, key: string, max: number): string {
  const value = typeof input[key] === "string" ? input[key].trim() : "";
  if (!value || value.length > max) throw new AdminWorkspaceError(422, `invalid_${key}`);
  return value;
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function executeAdminOperation(kind: AdminOperationKind, id: string, command: AdminOperationCommand, actorUserId: string) {
  if (!allowed[kind].includes(command.action)) throw new AdminWorkspaceError(400, "action_not_allowed");

  if (kind === "automation") {
    const record = await prisma.automation.findUnique({ where: { id } }); if (!record) throw new AdminWorkspaceError(404, "operation_not_found");
    const workspace = await protectWorkspace(record.workspaceId);
    if (["activate", "update", "restore_version"].includes(command.action) && workspace.status !== "ACTIVE") throw new AdminWorkspaceError(409, "workspace_inactive");
    if (command.action === "activate") { if (!['DRAFT', 'PAUSED'].includes(record.status) || record.archivedAt) throw new AdminWorkspaceError(409, "invalid_transition"); changed((await prisma.automation.updateMany({ where: { id, version: command.version }, data: { status: "ACTIVE", activatedAt: new Date(), version: { increment: 1 } } })).count); }
    else if (command.action === "pause") { if (record.status !== "ACTIVE") throw new AdminWorkspaceError(409, "invalid_transition"); changed((await prisma.automation.updateMany({ where: { id, version: command.version }, data: { status: "PAUSED", version: { increment: 1 } } })).count); }
    else if (command.action === "archive") { changed((await prisma.automation.updateMany({ where: { id, version: command.version }, data: { status: "PAUSED", archivedAt: new Date(), version: { increment: 1 } } })).count); }
    else if (command.action === "update") {
      const name = command.input.name === undefined ? record.name : stringInput(command.input, "name", 120);
      const definition = command.input.definition === undefined ? record.definition : validateFlowDefinition(command.input.definition);
      await prisma.$transaction(async (tx) => { const current = await tx.automation.findFirst({ where: { id, version: command.version } }); if (!current) throw new AdminWorkspaceError(409, "stale_version"); await tx.automationVersion.create({ data: { id: createId("automation_version"), automationId: id, workspaceId: record.workspaceId, version: record.version, name: record.name, definition: record.definition as Prisma.InputJsonValue, status: record.status, priority: record.priority, activatedAt: record.activatedAt, boundMediaId: record.boundMediaId, instagramAccountId: record.instagramAccountId, facebookPageId: record.facebookPageId, snapshotBy: actorUserId } }); await tx.automation.update({ where: { id }, data: { name, definition: definition as Prisma.InputJsonValue, version: { increment: 1 } } }); });
    } else {
      const versionNumber = z.number().int().positive().parse(command.input.versionNumber);
      const snapshot = await prisma.automationVersion.findUnique({ where: { automationId_version: { automationId: id, version: versionNumber } } }); if (!snapshot) throw new AdminWorkspaceError(404, "version_not_found");
      await prisma.$transaction(async (tx) => { const current = await tx.automation.findFirst({ where: { id, version: command.version } }); if (!current) throw new AdminWorkspaceError(409, "stale_version"); await tx.automationVersion.create({ data: { id: createId("automation_version"), automationId: id, workspaceId: record.workspaceId, version: record.version, name: record.name, definition: record.definition as Prisma.InputJsonValue, status: record.status, priority: record.priority, activatedAt: record.activatedAt, boundMediaId: record.boundMediaId, instagramAccountId: record.instagramAccountId, facebookPageId: record.facebookPageId, snapshotBy: actorUserId } }); await tx.automation.update({ where: { id }, data: { name: snapshot.name, definition: snapshot.definition as Prisma.InputJsonValue, status: snapshot.status, priority: snapshot.priority, activatedAt: snapshot.activatedAt, boundMediaId: snapshot.boundMediaId, instagramAccountId: snapshot.instagramAccountId, facebookPageId: snapshot.facebookPageId, archivedAt: null, version: { increment: 1 } } }); });
    }
    return { id, kind, action: command.action, version: command.version + 1 };
  }

  if (kind === "sequence") {
    const record = await prisma.automationSequence.findUnique({ where: { id } }); if (!record) throw new AdminWorkspaceError(404, "operation_not_found"); const workspace = await protectWorkspace(record.workspaceId); if (["activate", "update"].includes(command.action) && workspace.status !== "ACTIVE") throw new AdminWorkspaceError(409, "workspace_inactive");
    let data: Prisma.AutomationSequenceUpdateManyMutationInput;
    if (command.action === "activate") { if (!['DRAFT', 'PAUSED'].includes(record.status) || record.archivedAt) throw new AdminWorkspaceError(409, "invalid_transition"); data = { status: "ACTIVE" }; }
    else if (command.action === "pause") { if (record.status !== "ACTIVE") throw new AdminWorkspaceError(409, "invalid_transition"); data = { status: "PAUSED" }; }
    else if (command.action === "archive") data = { status: "PAUSED", archivedAt: new Date() };
    else data = { name: command.input.name === undefined ? undefined : stringInput(command.input, "name", 120) };
    changed((await prisma.automationSequence.updateMany({ where: { id, version: command.version }, data: { ...data, version: { increment: 1 } } })).count); return { id, kind, action: command.action, version: command.version + 1 };
  }

  if (kind === "broadcast") {
    const record = await prisma.broadcast.findUnique({ where: { id } }); if (!record) throw new AdminWorkspaceError(404, "operation_not_found"); await protectWorkspace(record.workspaceId);
    if (command.action === "cancel_pending") { if (!['PENDING', 'RUNNING'].includes(record.status)) throw new AdminWorkspaceError(409, "invalid_transition"); return prisma.$transaction(async (tx) => { changed((await tx.broadcast.updateMany({ where: { id, version: command.version }, data: { status: "CANCELLED", cancelledAt: new Date(), completedAt: new Date(), version: { increment: 1 } } })).count); const deliveries = await tx.outboundDelivery.updateMany({ where: { broadcastId: id, OR: [{ state: "PENDING" }, { state: "FAILED", retryable: true }] }, data: { state: "CANCELLED", retryable: false, version: { increment: 1 } } }); return { id, kind, action: command.action, cancelled: deliveries.count, version: command.version + 1 }; }); }
    const deliveries = await prisma.outboundDelivery.findMany({ where: { broadcastId: id, state: "FAILED", retryable: true, providerMessageId: null }, select: { id: true, deliveryKey: true, workspaceId: true, broadcastId: true, instagramAccountId: true, recipientId: true, version: true } });
    const valid = deliveries.filter((d): d is typeof d & { broadcastId: string; instagramAccountId: string; recipientId: string } => Boolean(d.broadcastId && d.instagramAccountId && d.recipientId));
    const enqueue = await enqueueBroadcastSends(valid.map((d) => ({ deliveryKey: d.deliveryKey, broadcastId: d.broadcastId, workspaceId: d.workspaceId, igAccountId: d.instagramAccountId, igScopedUserId: d.recipientId })));
    if (enqueue.accepted.length) await prisma.outboundDelivery.updateMany({ where: { id: { in: valid.map((d) => d.id) }, state: "FAILED", retryable: true, providerMessageId: null }, data: { state: "PENDING", retryable: false, version: { increment: 1 } } });
    return { id, kind, action: command.action, retried: enqueue.accepted.length, rejected: enqueue.rejected.length, version: command.version };
  }

  if (kind === "contact") {
    const record = await prisma.automationContact.findUnique({ where: { id }, include: { _count: { select: { enrollments: true } } } }); if (!record) throw new AdminWorkspaceError(404, "operation_not_found"); await protectWorkspace(record.workspaceId);
    if (command.action === "export_one") { const rows = [["id", "email", "lead_status", "score", "suppressed", "created_at"], [record.id, record.email ?? "", record.leadStatus, record.score, Boolean(record.suppressedAt), record.createdAt.toISOString()]]; return { id, kind, action: command.action, csv: `${rows.map((r) => r.map(csvCell).join(",")).join("\n")}\n` }; }
    if (command.action === "delete") { if (record._count.enrollments) throw new AdminWorkspaceError(409, "contact_history_exists"); changed((await prisma.automationContact.deleteMany({ where: { id, version: command.version } })).count); return { id, kind, action: command.action, deleted: true }; }
    const data: Prisma.AutomationContactUpdateManyMutationInput = command.action === "suppress" ? { suppressedAt: new Date() } : command.action === "unsuppress" ? { suppressedAt: null } : { leadStatus: typeof command.input.leadStatus === "string" ? command.input.leadStatus as never : undefined, notes: typeof command.input.notes === "string" ? command.input.notes.slice(0, 4000) : undefined, assigneeUserId: typeof command.input.assigneeUserId === "string" ? command.input.assigneeUserId : undefined };
    changed((await prisma.automationContact.updateMany({ where: { id, version: command.version }, data: { ...data, version: { increment: 1 } } })).count); return { id, kind, action: command.action, version: command.version + 1 };
  }

  if (kind === "tracked_link") {
    const record = await prisma.trackedLink.findUnique({ where: { id } }); if (!record) throw new AdminWorkspaceError(404, "operation_not_found"); await protectWorkspace(record.workspaceId);
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
  if (command.action === "cancel_pending") { if (!(record.state === "PENDING" || (record.state === "FAILED" && record.retryable))) throw new AdminWorkspaceError(409, "invalid_transition"); changed((await prisma.outboundDelivery.updateMany({ where: { id, version: command.version }, data: { state: "CANCELLED", retryable: false, version: { increment: 1 } } })).count); }
  else if (command.action === "release_stale_claim") { if (record.state !== "CLAIMED" || !record.claimExpiresAt || record.claimExpiresAt > new Date()) throw new AdminWorkspaceError(409, "claim_active"); changed((await prisma.outboundDelivery.updateMany({ where: { id, version: command.version, state: "CLAIMED", claimExpiresAt: { lte: new Date() } }, data: { state: "PENDING", claimOwner: null, claimExpiresAt: null, retryable: true, version: { increment: 1 } } })).count); }
  else {
    if (record.providerMessageId || record.state === "SENT") throw new AdminWorkspaceError(409, "already_sent"); if (record.state !== "FAILED" || !record.retryable) throw new AdminWorkspaceError(409, "not_retryable");
    let queued = false;
    if (record.broadcastId && record.instagramAccountId && record.recipientId) queued = (await enqueueBroadcastSends([{ deliveryKey: record.deliveryKey, broadcastId: record.broadcastId, workspaceId: record.workspaceId, igAccountId: record.instagramAccountId, igScopedUserId: record.recipientId }])).accepted.length === 1;
    else if (record.kind === "LEAD_EMAIL" || record.kind === "LEAD_WEBHOOK") queued = await enqueueLeadDelivery({ deliveryKey: record.deliveryKey, workspaceId: record.workspaceId, kind: record.kind });
    if (!queued) throw new AdminWorkspaceError(503, "retry_queue_unavailable");
    changed((await prisma.outboundDelivery.updateMany({ where: { id, version: command.version, providerMessageId: null }, data: { state: "PENDING", retryable: false, version: { increment: 1 } } })).count);
  }
  return { id, kind: "delivery", action: command.action, version: command.version + 1 };
}

async function executeWebhookCommand(id: string, command: AdminOperationCommand) {
  const record = await prisma.webhookEvent.findUnique({ where: { id } }); if (!record) throw new AdminWorkspaceError(404, "operation_not_found"); await protectWorkspace(record.workspaceId); if (record.adminReprocessCount >= 3) throw new AdminWorkspaceError(409, "reprocess_limit_reached");
  const payload = record.payload as Record<string, unknown>; let enqueued = 0;
  if (record.eventType.startsWith("facebook.") && typeof payload.pageId === "string" && typeof payload.commentId === "string" && typeof payload.postId === "string") enqueued = await enqueueFacebookEvents([{ id: record.providerEventId, pageId: payload.pageId, commentId: payload.commentId, postId: payload.postId, text: typeof payload.text === "string" ? payload.text : "", senderId: typeof payload.senderId === "string" ? payload.senderId : undefined, senderName: typeof payload.senderName === "string" ? payload.senderName : undefined, timestamp: record.receivedAt.getTime() } satisfies FacebookNormalizedEvent]);
  else if (typeof payload.accountId === "string" && ["comment.created", "message.received", "quick_reply.received", "postback.received", "optin.received", "referral.received", "story_mention.received"].includes(record.eventType)) enqueued = await enqueueWebhookEvents([{ id: record.providerEventId, type: record.eventType as NormalizedEvent["type"], accountId: payload.accountId, text: typeof payload.text === "string" ? payload.text : "", recipientId: typeof payload.recipientId === "string" ? payload.recipientId : undefined, senderUsername: typeof payload.senderUsername === "string" ? payload.senderUsername : undefined, mediaId: typeof payload.mediaId === "string" ? payload.mediaId : undefined, commentId: typeof payload.commentId === "string" ? payload.commentId : undefined, timestamp: record.receivedAt.getTime() }]);
  else throw new AdminWorkspaceError(409, "unsupported_webhook_event");
  if (!enqueued) throw new AdminWorkspaceError(503, "retry_queue_unavailable");
  changed((await prisma.webhookEvent.updateMany({ where: { id, version: command.version, adminReprocessCount: { lt: 3 } }, data: { adminReprocessCount: { increment: 1 }, processedAt: null, version: { increment: 1 } } })).count);
  return { id, kind: "webhook", action: command.action, version: command.version + 1 };
}
