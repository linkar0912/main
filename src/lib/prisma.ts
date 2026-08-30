import { Prisma, PrismaClient } from "@prisma/client";
import { createId } from "./id";
import type {
  AutomationRecord,
  AutomationParticipantRecord,
  AutomationStatus,
  AutomationVersionRecord,
  TrackedLinkRecord,
  TrackedLinkClickRecord,
  TrackedLinkStats,
  AutomationRepository,
  CreateAutomationInput,
  CreateParticipantInput,
  ExecutionDispatchStatus,
  ExecutionRecord,
  FacebookPageConnectionRecord,
  InstagramConnectionRecord,
  RecordExecutionInput,
  RecordExecutionResult,
  UpdateAutomationInput,
  DataDeletionRequestRecord,
  ParticipantPatch,
  ParticipantState,
  MemberRole,
  MemberRecord,
  InvitationRecord,
  AutomationContactRecord,
  CapturedContactSummary,
  LeadStatus,
  ContactTimelineEntry,
  VariantPerformance,
  WebhookEventRecord,
  RecordWebhookEventInput,
  AutomationSequenceRecord,
  SequenceStep,
  SequenceEnrollmentRecord,
  EnrollmentState,
  SequenceEnrollmentCount,
  DueSequenceSend,
  BroadcastRecord,
  MessagingWindow,
  EnsureOutboundDeliveryInput,
  OutboundDeliveryRecord,
} from "./repository";
import { broadcastSegmentCutoff, InstagramAccountOwnershipError, FacebookPageOwnershipError, AUTOMATIC_CONTACT_TAGS, LEAD_STATUS_SCORE_DELTA } from "./repository";
import type { EmailCaptureField } from "./automation/types";
import { toMessagingWindow } from "./messaging-window";
import { FOLLOWED_STATES, OPTED_IN_OR_LATER_STATES } from "./automation/activity-summary";

function mapInvitation(record: {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  tokenHash: string;
  invitedByUserId: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): InvitationRecord {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    email: record.email,
    role: record.role as InvitationRecord["role"],
    tokenHash: record.tokenHash,
    invitedByUserId: record.invitedByUserId,
    expiresAt: record.expiresAt.toISOString(),
    acceptedAt: record.acceptedAt?.toISOString(),
    revokedAt: record.revokedAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

function mapAutomation(record: {
  id: string;
  workspaceId: string;
  instagramAccountId: string | null;
  facebookPageId: string | null;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED";
  version: number;
  definition: unknown;
  activatedAt: Date | null;
  boundMediaId: string | null;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}): AutomationRecord {
  return {
    ...record,
    definition: record.definition as AutomationRecord["definition"],
    activatedAt: record.activatedAt?.toISOString(),
    boundMediaId: record.boundMediaId ?? undefined,
    instagramAccountId: record.instagramAccountId ?? undefined,
    facebookPageId: record.facebookPageId ?? undefined,
    priority: record.priority,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapExecution(record: {
  id: string;
  workspaceId: string;
  automationId: string;
  externalEventId: string;
  dedupeKey: string;
  status: ExecutionRecord["status"];
  dispatchStatus: string;
  dispatchOwner: string | null;
  dispatchStartedAt: Date | null;
  dispatchLeaseExpiresAt: Date | null;
  reason: string | null;
  providerMessageId: string | null;
  providerRecipientId: string | null;
  createdAt: Date;
}): ExecutionRecord {
  return {
    ...record,
    dispatchStatus: record.dispatchStatus as ExecutionDispatchStatus,
    dispatchOwner: record.dispatchOwner ?? undefined,
    dispatchStartedAt: record.dispatchStartedAt?.toISOString(),
    dispatchLeaseExpiresAt: record.dispatchLeaseExpiresAt?.toISOString(),
    reason: record.reason ?? undefined,
    providerMessageId: record.providerMessageId ?? undefined,
    providerRecipientId: record.providerRecipientId ?? undefined,
    createdAt: record.createdAt.toISOString(),
  };
}

function mapOutboundDelivery(record: {
  id: string;
  deliveryKey: string;
  workspaceId: string;
  kind: string;
  recipientId: string | null;
  instagramAccountId: string | null;
  automationId: string | null;
  participantId: string | null;
  sequenceEnrollmentId: string | null;
  broadcastId: string | null;
  payload: unknown;
  state: string;
  retryable: boolean;
  resultCode: string | null;
  claimOwner: string | null;
  claimExpiresAt: Date | null;
  attemptCount: number;
  providerMessageId: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
}): OutboundDeliveryRecord {
  return {
    id: record.id,
    deliveryKey: record.deliveryKey,
    workspaceId: record.workspaceId,
    kind: record.kind as OutboundDeliveryRecord["kind"],
    recipientId: record.recipientId ?? undefined,
    instagramAccountId: record.instagramAccountId ?? undefined,
    automationId: record.automationId ?? undefined,
    participantId: record.participantId ?? undefined,
    sequenceEnrollmentId: record.sequenceEnrollmentId ?? undefined,
    broadcastId: record.broadcastId ?? undefined,
    payload: record.payload as Record<string, unknown>,
    state: record.state as OutboundDeliveryRecord["state"],
    retryable: record.retryable,
    resultCode: record.resultCode as OutboundDeliveryRecord["resultCode"],
    claimOwner: record.claimOwner ?? undefined,
    claimExpiresAt: record.claimExpiresAt?.toISOString(),
    attemptCount: record.attemptCount,
    providerMessageId: record.providerMessageId ?? undefined,
    lastError: record.lastError ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    sentAt: record.sentAt?.toISOString(),
  };
}

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function validateUtcDate(utcDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(utcDate)) {
    throw new Error("utcDate must use YYYY-MM-DD");
  }
  const parsed = new Date(`${utcDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== utcDate) {
    throw new Error("utcDate must use YYYY-MM-DD");
  }
}

function validateQuotaRequest(utcDate: string, amount: number, limit: number): void {
  validateUtcDate(utcDate);
  validatePositiveInteger(amount, "amount");
  validatePositiveInteger(limit, "limit");
  if (limit < amount) throw new Error("limit must be greater than or equal to amount");
}

function mapParticipant(record: {
  id: string;
  workspaceId: string;
  automationId: string;
  instagramAccountId: string;
  igScopedUserId: string | null;
  sourceCommentId: string;
  sourceMediaId: string;
  sourceMediaSnapshot: unknown;
  matchedKeyword: string | null;
  state: ParticipantState;
  publicReplyStatus: string;
  publicReplyProviderId: string | null;
  publicReplySentAt: Date | null;
  publicReplyError: string | null;
  openingStatus: string;
  openingProviderId: string | null;
  openingSentAt: Date | null;
  openingError: string | null;
  followStatus: boolean | null;
  followCheckedAt: Date | null;
  followCheckError: string | null;
  finalDeliveryStatus: string;
  finalProviderId: string | null;
  finalDeliveredAt: Date | null;
  finalDeliveryError: string | null;
  deliveryClickedAt: Date | null;
  messagingWindowExpiresAt: Date | null;
  recheckCount: number;
  variantLabel: string | null;
  pausedAt: Date | null;
  pausedReason: string | null;
  pausedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AutomationParticipantRecord {
  return {
    ...record,
    igScopedUserId: record.igScopedUserId ?? undefined,
    sourceMediaSnapshot: record.sourceMediaSnapshot as AutomationParticipantRecord["sourceMediaSnapshot"],
    matchedKeyword: record.matchedKeyword ?? undefined,
    publicReplyProviderId: record.publicReplyProviderId ?? undefined,
    publicReplySentAt: record.publicReplySentAt?.toISOString(),
    publicReplyError: record.publicReplyError ?? undefined,
    openingProviderId: record.openingProviderId ?? undefined,
    openingSentAt: record.openingSentAt?.toISOString(),
    openingError: record.openingError ?? undefined,
    followStatus: record.followStatus ?? undefined,
    followCheckedAt: record.followCheckedAt?.toISOString(),
    followCheckError: record.followCheckError ?? undefined,
    finalProviderId: record.finalProviderId ?? undefined,
    finalDeliveredAt: record.finalDeliveredAt?.toISOString(),
    finalDeliveryError: record.finalDeliveryError ?? undefined,
    deliveryClickedAt: record.deliveryClickedAt?.toISOString(),
    messagingWindowExpiresAt: record.messagingWindowExpiresAt?.toISOString(),
    variantLabel: record.variantLabel ?? undefined,
    pausedAt: record.pausedAt?.toISOString(),
    pausedReason: record.pausedReason ?? undefined,
    pausedByUserId: record.pausedByUserId ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapContact(record: {
  id: string;
  workspaceId: string;
  instagramAccountId: string;
  igScopedUserId: string;
  email: string | null;
  state: AutomationContactRecord["state"];
  awaitingAutomationId: string | null;
  awaitingSince: Date | null;
  attempts: number;
  tags: string[];
  score: number;
  leadStatus: AutomationContactRecord["leadStatus"];
  assigneeUserId: string | null;
  notes: string | null;
  sourceAutomationId: string | null;
  suppressedAt: Date | null;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): AutomationContactRecord {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    instagramAccountId: record.instagramAccountId,
    igScopedUserId: record.igScopedUserId,
    email: record.email ?? undefined,
    state: record.state,
    awaitingAutomationId: record.awaitingAutomationId ?? undefined,
    awaitingSince: record.awaitingSince?.toISOString(),
    attempts: record.attempts,
    tags: record.tags,
    score: record.score,
    leadStatus: record.leadStatus,
    assigneeUserId: record.assigneeUserId ?? undefined,
    notes: record.notes ?? undefined,
    sourceAutomationId: record.sourceAutomationId ?? undefined,
    fields: (record as unknown as { fields?: Record<string, string> | null }).fields ?? undefined,
    awaitingFields: (record as unknown as { awaitingFields?: { id: string; question: string }[] | null }).awaitingFields ?? undefined,
    suppressedAt: record.suppressedAt?.toISOString(),
    lastSeenAt: record.lastSeenAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapAutomationVersion(record: {
  id: string;
  automationId: string;
  workspaceId: string;
  version: number;
  name: string;
  definition: Prisma.JsonValue;
  status: AutomationStatus;
  priority: number;
  activatedAt: Date | null;
  boundMediaId: string | null;
  instagramAccountId: string | null;
  facebookPageId: string | null;
  snapshotBy: string | null;
  snapshotAt: Date;
}): AutomationVersionRecord {
  return {
    id: record.id,
    automationId: record.automationId,
    workspaceId: record.workspaceId,
    version: record.version,
    name: record.name,
    definition: record.definition as unknown as AutomationVersionRecord["definition"],
    status: record.status,
    priority: record.priority,
    ...(record.activatedAt ? { activatedAt: record.activatedAt.toISOString() } : {}),
    ...(record.boundMediaId ? { boundMediaId: record.boundMediaId } : {}),
    ...(record.instagramAccountId ? { instagramAccountId: record.instagramAccountId } : {}),
    ...(record.facebookPageId ? { facebookPageId: record.facebookPageId } : {}),
    ...(record.snapshotBy ? { snapshotBy: record.snapshotBy } : {}),
    snapshotAt: record.snapshotAt.toISOString(),
  };
}

function mapFacebookPage(record: {
  id: string;
  workspaceId: string;
  pageId: string;
  pageName: string;
  facebookUserId: string | null;
  accessTokenEncrypted: string;
  tokenExpiresAt: Date | null;
  status: "CONNECTED" | "DISCONNECTED" | "EXPIRED";
  connectedAt: Date;
}): FacebookPageConnectionRecord {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    pageId: record.pageId,
    pageName: record.pageName,
    ...(record.facebookUserId ? { facebookUserId: record.facebookUserId } : {}),
    accessTokenEncrypted: record.accessTokenEncrypted,
    tokenExpiresAt: record.tokenExpiresAt?.toISOString(),
    status: record.status,
    connectedAt: record.connectedAt.toISOString(),
  };
}

function mapSequenceRow(record: {
  id: string;
  workspaceId: string;
  name: string;
  status: string;
  steps: unknown;
  sourceAutomationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AutomationSequenceRecord {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    status: record.status as AutomationSequenceRecord["status"],
    steps: record.steps as SequenceStep[],
    ...(record.sourceAutomationId ? { sourceAutomationId: record.sourceAutomationId } : {}),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapBroadcastRow(record: {
  id: string;
  workspaceId: string;
  name: string;
  text: string;
  segment: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  createdAt: Date;
  completedAt: Date | null;
}): BroadcastRecord {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    text: record.text,
    segment: record.segment as BroadcastRecord["segment"],
    status: record.status as BroadcastRecord["status"],
    total: record.total,
    sent: record.sent,
    failed: record.failed,
    skipped: record.skipped,
    createdAt: record.createdAt.toISOString(),
    completedAt: record.completedAt?.toISOString(),
  };
}

// Diagnostic/error fields that campaign-runner.ts intentionally clears by passing `undefined`
// in a transitionParticipant patch (e.g. once a retried action succeeds). Prisma's `update`
// treats `undefined` as "leave this column untouched" (not "set to null"), unlike the memory
// repository's plain object spread, which does clear it. Map `undefined` to `null` for exactly
// these fields - and only when the caller explicitly included the key (clearing intent) rather
// than omitted it (leave-untouched intent) - so both repositories share the same clear semantics.
const CLEARABLE_PARTICIPANT_ERROR_FIELDS = [
  "publicReplyError",
  "openingError",
  "followCheckError",
  "finalDeliveryError",
] as const;

function mapParticipantPatch(patch: ParticipantPatch) {
  const clearedErrors: Partial<Record<typeof CLEARABLE_PARTICIPANT_ERROR_FIELDS[number], null>> = {};
  for (const field of CLEARABLE_PARTICIPANT_ERROR_FIELDS) {
    if (field in patch && patch[field] === undefined) clearedErrors[field] = null;
  }
  return {
    ...patch,
    publicReplySentAt: patch.publicReplySentAt ? new Date(patch.publicReplySentAt) : undefined,
    openingSentAt: patch.openingSentAt ? new Date(patch.openingSentAt) : undefined,
    followCheckedAt: patch.followCheckedAt ? new Date(patch.followCheckedAt) : undefined,
    finalDeliveredAt: patch.finalDeliveredAt ? new Date(patch.finalDeliveredAt) : undefined,
    deliveryClickedAt: patch.deliveryClickedAt ? new Date(patch.deliveryClickedAt) : undefined,
    messagingWindowExpiresAt: patch.messagingWindowExpiresAt ? new Date(patch.messagingWindowExpiresAt) : undefined,
    ...clearedErrors,
  };
}

function mapConnection(record: {
  id: string;
  workspaceId: string;
  igUserId: string;
  username: string;
  accessTokenEncrypted: string;
  tokenExpiresAt: Date | null;
  status: "CONNECTED" | "DISCONNECTED" | "EXPIRED";
  connectedAt: Date;
}): InstagramConnectionRecord {
  return {
    ...record,
    tokenExpiresAt: record.tokenExpiresAt?.toISOString(),
    connectedAt: record.connectedAt.toISOString(),
  };
}

function mapDeletionRequest(record: {
  confirmationCode: string;
  signedRequestHash: string;
  status: string;
  requestedAt: Date;
  completedAt: Date | null;
}): DataDeletionRequestRecord {
  return {
    confirmationCode: record.confirmationCode,
    signedRequestHash: record.signedRequestHash,
    status: record.status === "COMPLETED" ? "COMPLETED" : "PENDING",
    requestedAt: record.requestedAt.toISOString(),
    completedAt: record.completedAt?.toISOString(),
  };
}

/** Buckets ISO timestamps into UTC day counts over the trailing `days` window. */
function bucketCountsByDay(timestamps: string[], days: number): { day: string; count: number }[] {
  const buckets = new Map<string, number>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - offset);
    buckets.set(date.toISOString().slice(0, 10), 0);
  }
  for (const timestamp of timestamps) {
    const day = timestamp.slice(0, 10);
    if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([day, count]) => ({ day, count }));
}

export function createPrismaRepository(client = prisma): AutomationRepository {
  return {
    async ensureWorkspace(workspaceId, ownerEmail) {
      await client.workspace.upsert({
        where: { id: workspaceId },
        create: {
          id: workspaceId,
          name: "Linkar workspace",
          slug: `linkar-${workspaceId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}`,
          members: { create: { id: createId("member"), email: ownerEmail, role: "OWNER" } },
        },
        update: {},
      });
    },

    async listMembers(workspaceId): Promise<MemberRecord[]> {
      const records = await client.workspaceMember.findMany({
        where: { workspaceId },
        orderBy: [{ role: "asc" }, { email: "asc" }],
      });
      return records.map((record) => ({
        id: record.id,
        workspaceId: record.workspaceId,
        email: record.email,
        role: record.role as MemberRole,
      }));
    },

    async getMemberRole(workspaceId, email) {
      const record = await client.workspaceMember.findUnique({
        where: { workspaceId_email: { workspaceId, email: email.toLowerCase() } },
        select: { role: true },
      });
      return (record?.role as MemberRole | undefined) ?? null;
    },

    async addMember(workspaceId, email, role) {
      try {
        await client.workspaceMember.create({
          data: { id: createId("member"), workspaceId, email: email.toLowerCase(), role },
        });
        return { created: true };
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") return { created: false };
        throw error;
      }
    },

    async updateMemberRole(workspaceId, email, role) {
      const result = await client.workspaceMember.updateMany({
        where: { workspaceId, email: email.toLowerCase(), NOT: { role: "OWNER" } },
        data: { role },
      });
      return result.count === 1;
    },

    async removeMember(workspaceId, email) {
      const result = await client.workspaceMember.deleteMany({
        where: { workspaceId, email: email.toLowerCase(), NOT: { role: "OWNER" } },
      });
      return result.count === 1;
    },

    async createInvitation(input) {
      const record = await client.workspaceInvitation.create({
        data: {
          id: createId("invitation"),
          workspaceId: input.workspaceId,
          email: input.email.toLowerCase(),
          role: input.role,
          tokenHash: input.tokenHash,
          invitedByUserId: input.invitedByUserId,
          expiresAt: new Date(input.expiresAt),
        },
      });
      return mapInvitation(record);
    },

    async listInvitations(workspaceId) {
      const records = await client.workspaceInvitation.findMany({
        where: { workspaceId, revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });
      return records.map(mapInvitation);
    },

    async findInvitationByTokenHash(tokenHash) {
      const record = await client.workspaceInvitation.findUnique({ where: { tokenHash } });
      return record ? mapInvitation(record) : null;
    },

    async acceptInvitation(id, nowIso) {
      const accepted = await client.workspaceInvitation.updateMany({
        where: { id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date(nowIso) } },
        data: { acceptedAt: new Date(nowIso) },
      });
      if (accepted.count !== 1) return null;
      const record = await client.workspaceInvitation.findUniqueOrThrow({ where: { id } });
      await this.addMember(record.workspaceId, record.email, record.role as MemberRole);
      return mapInvitation(record);
    },

    async revokeInvitation(workspaceId, id) {
      const revoked = await client.workspaceInvitation.updateMany({
        where: { id, workspaceId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return revoked.count === 1;
    },

    async countParticipantsByState(workspaceId, automationId) {
      const grouped = await client.automationParticipant.groupBy({
        by: ["state"],
        where: { workspaceId, ...(automationId ? { automationId } : {}) },
        _count: { _all: true },
      });
      return Object.fromEntries(grouped.map((group) => [group.state, group._count._all]));
    },

    async countParticipantsBySender(automationId, instagramAccountId, igScopedUserId) {
      return client.automationParticipant.count({
        where: { automationId, instagramAccountId, igScopedUserId },
      });
    },

    async countExecutionsSentSince(automationId, sinceIso) {
      return client.automationExecution.count({
        where: { automationId, status: "SENT", createdAt: { gte: new Date(sinceIso) } },
      });
    },

    async countParticipantsCreatedSince(workspaceId, sinceIso) {
      return client.automationParticipant.count({
        where: { workspaceId, createdAt: { gte: new Date(sinceIso) } },
      });
    },

    async countParticipantsPerDay(workspaceId, days, automationId) {
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - (days - 1));
      const rows = await client.automationParticipant.findMany({
        where: { workspaceId, ...(automationId ? { automationId } : {}), createdAt: { gte: since } },
        select: { createdAt: true },
      });
      return bucketCountsByDay(rows.map((row) => row.createdAt.toISOString()), days);
    },

    async countExecutionsSentPerDay(workspaceId, days, automationId) {
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - (days - 1));
      const rows = await client.automationExecution.findMany({
        where: { workspaceId, ...(automationId ? { automationId } : {}), status: "SENT", createdAt: { gte: since } },
        select: { createdAt: true },
      });
      return bucketCountsByDay(rows.map((row) => row.createdAt.toISOString()), days);
    },

    async countParticipantsByMedia(workspaceId, automationId) {
      // Three filtered group-bys are clearer and more portable than one raw query.
      const [matchedRows, deliveredRows, clickedRows] = await Promise.all([
        client.automationParticipant.groupBy({
          by: ["sourceMediaId"],
          where: { workspaceId, ...(automationId ? { automationId } : {}) },
          _count: { _all: true },
        }),
        client.automationParticipant.groupBy({
          by: ["sourceMediaId"],
          where: { workspaceId, ...(automationId ? { automationId } : {}), state: "LINK_SENT" },
          _count: { _all: true },
        }).catch(() => [] as { sourceMediaId: string; _count: { _all: number } }[]),
        client.automationParticipant.groupBy({
          by: ["sourceMediaId"],
          where: { workspaceId, ...(automationId ? { automationId } : {}), NOT: { deliveryClickedAt: null } },
          _count: { _all: true },
        }).catch(() => [] as { sourceMediaId: string; _count: { _all: number } }[]),
      ]);
      const delivered = new Map(deliveredRows.map((group) => [group.sourceMediaId, group._count._all]));
      const clicked = new Map(clickedRows.map((group) => [group.sourceMediaId, group._count._all]));
      return matchedRows.map((group) => ({
        mediaId: group.sourceMediaId,
        matched: group._count._all,
        delivered: delivered.get(group.sourceMediaId) ?? 0,
        clicked: clicked.get(group.sourceMediaId) ?? 0,
      }));
    },

    async countParticipantFunnel(workspaceId, automationId) {
      const rows = await client.automationParticipant.groupBy({
        by: ["state", "openingStatus", "followStatus", "finalDeliveryStatus"],
        where: { workspaceId, automationId },
        _count: { _all: true },
      });
      const result = { commented: 0, openingSent: 0, optedIn: 0, followed: 0, linkSent: 0 };
      // Use the shared classification sets so the funnel numbers agree with
      // the in-memory `computeFunnelSummary` (activity-summary.ts) - any new
      // ParticipantState added to the enum will need to be added in both
      // places at once, but only one place per file.
      for (const row of rows) {
        const count = row._count._all;
        result.commented += count;
        if (row.openingStatus === "SENT") result.openingSent += count;
        if (OPTED_IN_OR_LATER_STATES.has(row.state as ParticipantState)) result.optedIn += count;
        if (row.followStatus === true || FOLLOWED_STATES.has(row.state as ParticipantState)) result.followed += count;
        if (row.finalDeliveryStatus === "SENT") result.linkSent += count;
      }
      return result;
    },

    async getParticipantById(id) {
      const record = await client.automationParticipant.findUnique({ where: { id } });
      return record ? mapParticipant(record) : null;
    },

    async markDeliveryClicked(id, atIso) {
      // First click wins: only participants without a recorded click update.
      const updated = await client.automationParticipant.updateMany({
        where: { id, deliveryClickedAt: null },
        data: { deliveryClickedAt: new Date(atIso) },
      });
      if (updated.count !== 1) return false;
      // Engagement hook: tag + score the contact when the click is attributable.
      const participant = await client.automationParticipant.findUnique({ where: { id } });
      if (participant?.igScopedUserId) {
        await this.addContactTags(participant.workspaceId, participant.instagramAccountId, participant.igScopedUserId, ["clicked"]);
        await this.bumpContactScore(participant.workspaceId, participant.instagramAccountId, participant.igScopedUserId, 5);
      }
      return true;
    },

    async pauseParticipant(id, reason, userId, atIso) {
      const updated = await client.automationParticipant.update({
        where: { id },
        data: { pausedAt: new Date(atIso), pausedReason: reason, pausedByUserId: userId },
      });
      return mapParticipant(updated);
    },

    async resumeParticipant(id, atIso) {
      const updated = await client.automationParticipant.update({
        where: { id },
        data: { pausedAt: null, pausedReason: null, pausedByUserId: null, updatedAt: new Date(atIso) },
      });
      return mapParticipant(updated);
    },

    async pauseParticipantsBySender(workspaceId, instagramAccountId, igScopedUserId, reason, userId, atIso) {
      const result = await client.automationParticipant.updateMany({
        where: { workspaceId, instagramAccountId, igScopedUserId, pausedAt: null },
        data: { pausedAt: new Date(atIso), pausedReason: reason, pausedByUserId: userId },
      });
      return result.count;
    },

    async listPausedParticipantsByWorkspace(workspaceId, limit) {
      const records = await client.automationParticipant.findMany({
        where: { workspaceId, pausedAt: { not: null } },
        orderBy: [{ pausedAt: "desc" }, { id: "asc" }],
        take: limit,
      });
      return records.map(mapParticipant);
    },

    async findWorkspaceIdByMemberEmail(email) {
      const member = await client.workspaceMember.findFirst({
        where: { email: email.toLowerCase() },
        select: { workspaceId: true },
      });
      return member?.workspaceId ?? null;
    },

    async listAutomations(workspaceId) {
      const records = await client.automation.findMany({
        where: { workspaceId },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      });
      return records.map(mapAutomation);
    },

    async getAutomation(workspaceId, id) {
      const record = await client.automation.findFirst({ where: { workspaceId, id } });
      return record ? mapAutomation(record) : null;
    },

    async createAutomation(workspaceId, input: CreateAutomationInput) {
      const record = await client.automation.create({
        data: {
          id: createId("automation"),
          workspaceId,
          name: input.name.trim(),
          definition: input.definition,
          version: input.definition.version,
          instagramAccountId: input.instagramAccountId ?? null,
          facebookPageId: input.facebookPageId ?? null,
          priority: input.priority ?? 0,
        },
      });
      return mapAutomation(record);
    },

    async updateAutomation(workspaceId, id, patch: UpdateAutomationInput) {
      // Transaction keeps the existence check and the update atomic so a concurrent
      // delete cannot turn the findFirst/update pair into a spurious P2025 failure.
      // For the channel pins we strip them out of the spread and apply explicit
      // null-handling: the route layer rejects dual-pins, but a PATCH that clears
      // one channel must implicitly clear the other so a single request can never
      // leave the automation pinned to two channels.
      const { boundMediaId, instagramAccountId, facebookPageId, definition, ...rest } = patch;
      const data: Record<string, unknown> = {
        ...rest,
        ...(definition ? { version: definition.version } : {}),
      };
      if (boundMediaId !== undefined) data.boundMediaId = boundMediaId ?? null;
      if (instagramAccountId !== undefined) {
        data.instagramAccountId = instagramAccountId ?? null;
        if (instagramAccountId !== null && facebookPageId === undefined) {
          data.facebookPageId = null;
        }
      }
      if (facebookPageId !== undefined) {
        data.facebookPageId = facebookPageId ?? null;
        if (facebookPageId !== null && instagramAccountId === undefined) {
          data.instagramAccountId = null;
        }
      }
      const record = await client.$transaction(async (transaction) => {
        const existing = await transaction.automation.findFirst({ where: { workspaceId, id } });
        if (!existing) return null;
        return transaction.automation.update({ where: { id }, data });
      });
      return record ? mapAutomation(record) : null;
    },

    async listConnections(workspaceId) {
      const records = await client.instagramConnection.findMany({ where: { workspaceId } });
      return records.map(mapConnection);
    },

    async listConnectionsExpiringBefore(before) {
      const records = await client.instagramConnection.findMany({
        where: { status: "CONNECTED", tokenExpiresAt: { lte: new Date(before) } },
      });
      return records.map(mapConnection);
    },

    async updateConnectionToken(id, accessTokenEncrypted, tokenExpiresAt) {
      await client.instagramConnection.update({
        where: { id },
        data: { accessTokenEncrypted, tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : null },
      });
    },

    async updateConnectionStatus(id, status) {
      await client.instagramConnection.update({ where: { id }, data: { status } });
    },

    async findWorkspaceByInstagramAccount(igUserId) {
      const record = await client.instagramConnection.findUnique({
        where: { igUserId, status: "CONNECTED" },
      });
      return record ? { workspaceId: record.workspaceId, connection: mapConnection(record) } : null;
    },

    async deleteConnectionByInstagramAccount(igUserId) {
      await client.instagramConnection.deleteMany({ where: { igUserId } });
    },

    async deleteConnection(workspaceId, id) {
      const result = await client.instagramConnection.deleteMany({ where: { workspaceId, id } });
      return result.count > 0;
    },

    async beginInstagramDataDeletion(igUserId, confirmationCode, signedRequestHash) {
      const record = await client.$transaction(async (transaction) => {
        const connections = await transaction.instagramConnection.findMany({
          where: { igUserId },
          select: { workspaceId: true },
        });
        const workspaceIds = [...new Set(connections.map((connection) => connection.workspaceId))];
        // Automations pinned to the deleted account can never fire again; remove
        // them even when sibling connections keep the workspace alive.
        if (workspaceIds.length > 0) {
          await transaction.automation.deleteMany({
            where: { workspaceId: { in: workspaceIds }, instagramAccountId: igUserId },
          });
        }
        await transaction.automationContact.deleteMany({ where: { instagramAccountId: igUserId } });
        await transaction.automationParticipant.deleteMany({ where: { instagramAccountId: igUserId } });
        await transaction.instagramConnection.deleteMany({ where: { igUserId } });
        for (const workspaceId of workspaceIds) {
          const remainingConnections = await transaction.instagramConnection.count({ where: { workspaceId } });
          if (remainingConnections > 0) continue;
          await transaction.automationContact.deleteMany({ where: { workspaceId } });
          await transaction.automationParticipant.deleteMany({ where: { workspaceId } });
          await transaction.automationExecution.deleteMany({ where: { workspaceId } });
          await transaction.webhookEvent.deleteMany({ where: { workspaceId } });
          await transaction.automationSequence.deleteMany({ where: { workspaceId } });
          await transaction.broadcast.deleteMany({ where: { workspaceId } });
          await transaction.automation.deleteMany({ where: { workspaceId } });
        }
        return transaction.dataDeletionRequest.create({
          data: {
            id: createId("deletion"),
            confirmationCode,
            signedRequestHash,
            status: "PENDING",
          },
        });
      });
      return mapDeletionRequest(record);
    },

    async completeDataDeletion(confirmationCode) {
      const record = await client.dataDeletionRequest.update({
        where: { confirmationCode },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      return mapDeletionRequest(record);
    },

    async findDataDeletionByRequestHash(signedRequestHash) {
      const record = await client.dataDeletionRequest.findUnique({ where: { signedRequestHash } });
      return record ? mapDeletionRequest(record) : null;
    },

    async getDataDeletionRequest(confirmationCode) {
      const record = await client.dataDeletionRequest.findUnique({ where: { confirmationCode } });
      return record ? mapDeletionRequest(record) : null;
    },

    async upsertConnection(input) {
      // Wrap the ownership check and the upsert in a single transaction so
      // two concurrent calls from different workspaces cannot both pass the
      // pre-check and then race on the unique key. The transaction's
      // SERIALIZABLE-equivalent isolation (Prisma's default for $transaction
      // callbacks) makes the check + write atomic.
      try {
        return await client.$transaction(async (transaction) => {
          const owner = await transaction.instagramConnection.findUnique({ where: { igUserId: input.igUserId } });
          if (owner && owner.workspaceId !== input.workspaceId) throw new InstagramAccountOwnershipError();
          const record = await transaction.instagramConnection.upsert({
            where: { igUserId: input.igUserId },
            create: { id: createId("connection"), ...input },
            update: input,
          });
          return mapConnection(record);
        });
      } catch (error) {
        if (error instanceof InstagramAccountOwnershipError) throw error;
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        // A concurrent transaction from another workspace won the unique-key
        // race. Re-read and surface the same ownership error so the caller
        // does not silently overwrite a foreign connection.
        const winner = await client.instagramConnection.findUnique({ where: { igUserId: input.igUserId } });
        if (winner?.workspaceId !== input.workspaceId) throw new InstagramAccountOwnershipError();
        if (!winner) throw error;
        return mapConnection(winner);
      }
    },

    // Facebook Page support (parallel to the IG block above). The v1 surface
    // is comment-reply automation only - no participants, contacts, sequences,
    // or broadcasts. The same ownership-race protection that protects IG
    // connections applies here.
    async listFacebookPages(workspaceId) {
      const records = await client.facebookPageConnection.findMany({ where: { workspaceId } });
      return records.map(mapFacebookPage);
    },
    async findWorkspaceByFacebookPage(pageId) {
      const record = await client.facebookPageConnection.findUnique({
        where: { pageId, status: "CONNECTED" },
      });
      return record ? { workspaceId: record.workspaceId, page: mapFacebookPage(record) } : null;
    },
    async upsertFacebookPage(input) {
      try {
        return await client.$transaction(async (transaction) => {
          const owner = await transaction.facebookPageConnection.findUnique({ where: { pageId: input.pageId } });
          if (owner && owner.workspaceId !== input.workspaceId) throw new FacebookPageOwnershipError();
          const record = await transaction.facebookPageConnection.upsert({
            where: { pageId: input.pageId },
            create: { id: createId("facebook_page"), ...input },
            update: input,
          });
          return mapFacebookPage(record);
        });
      } catch (error) {
        if (error instanceof FacebookPageOwnershipError) throw error;
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        const winner = await client.facebookPageConnection.findUnique({ where: { pageId: input.pageId } });
        if (winner?.workspaceId !== input.workspaceId) throw new FacebookPageOwnershipError();
        if (!winner) throw error;
        return mapFacebookPage(winner);
      }
    },
    async updateFacebookPageToken(id, accessTokenEncrypted, tokenExpiresAt) {
      await client.facebookPageConnection.update({
        where: { id },
        data: { accessTokenEncrypted, tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : null },
      });
    },
    async updateFacebookPageStatus(id, status) {
      await client.facebookPageConnection.update({ where: { id }, data: { status } });
    },
    async deleteFacebookPageByPageId(pageId) {
      await client.facebookPageConnection.deleteMany({ where: { pageId } });
    },
    async deleteFacebookPagesByUserId(facebookUserId) {
      await client.$transaction(async (transaction) => {
        const pages = await transaction.facebookPageConnection.findMany({
          where: { facebookUserId },
          select: { pageId: true },
        });
        const pageIds = pages.map((page) => page.pageId);
        if (pageIds.length > 0) {
          await transaction.automation.updateMany({
            where: { facebookPageId: { in: pageIds } },
            data: { facebookPageId: null },
          });
        }
        await transaction.facebookPageConnection.deleteMany({ where: { facebookUserId } });
      });
    },
    async deleteFacebookPage(workspaceId, id) {
      // Two-step delete: unpin any automations first so the runner never
      // tries to dispatch to a missing page, then drop the connection.
      return await client.$transaction(async (transaction) => {
        const page = await transaction.facebookPageConnection.findFirst({ where: { id, workspaceId } });
        if (!page) return false;
        await transaction.automation.updateMany({
          where: { workspaceId, facebookPageId: page.pageId },
          data: { facebookPageId: null },
        });
        await transaction.facebookPageConnection.delete({ where: { id } });
        return true;
      });
    },
    async claimFacebookReplyRecipient(input) {
      const claimed = await client.$executeRaw(Prisma.sql`
        INSERT INTO "FacebookReplyRecipient"
          ("id", "automationId", "pageId", "senderId", "claimEventId", "claimExpiresAt")
        VALUES
          (${createId("facebook_reply_recipient")}, ${input.automationId}, ${input.pageId}, ${input.senderId}, ${input.eventId}, ${new Date(input.claimExpiresAt)})
        ON CONFLICT ("automationId", "pageId", "senderId") DO UPDATE SET
          "claimEventId" = EXCLUDED."claimEventId",
          "claimExpiresAt" = EXCLUDED."claimExpiresAt"
        WHERE "FacebookReplyRecipient"."repliedAt" IS NULL
          AND (
            "FacebookReplyRecipient"."claimEventId" = EXCLUDED."claimEventId"
            OR "FacebookReplyRecipient"."claimExpiresAt" <= ${new Date(input.claimedAt)}
          )
      `);
      return claimed === 1;
    },
    async completeFacebookReplyRecipient(automationId, pageId, senderId, eventId, repliedAt) {
      await client.$executeRaw(Prisma.sql`
        UPDATE "FacebookReplyRecipient"
        SET "repliedAt" = ${new Date(repliedAt)}
        WHERE "automationId" = ${automationId}
          AND "pageId" = ${pageId}
          AND "senderId" = ${senderId}
          AND "claimEventId" = ${eventId}
      `);
    },
    async releaseFacebookReplyRecipient(automationId, pageId, senderId, eventId) {
      await client.$executeRaw(Prisma.sql`
        DELETE FROM "FacebookReplyRecipient"
        WHERE "automationId" = ${automationId}
          AND "pageId" = ${pageId}
          AND "senderId" = ${senderId}
          AND "claimEventId" = ${eventId}
          AND "repliedAt" IS NULL
      `);
    },
    async beginFacebookDataDeletion(facebookUserId, confirmationCode, signedRequestHash) {
      const record = await client.$transaction(async (transaction) => {
        const pages = await transaction.facebookPageConnection.findMany({
          where: { facebookUserId },
          select: { pageId: true },
        });
        const pageIds = pages.map((page) => page.pageId);
        if (pageIds.length > 0) await transaction.automation.deleteMany({ where: { facebookPageId: { in: pageIds } } });
        await transaction.facebookPageConnection.deleteMany({ where: { facebookUserId } });
        return transaction.dataDeletionRequest.create({
          data: { id: createId("deletion"), confirmationCode, signedRequestHash, status: "PENDING" },
        });
      });
      return mapDeletionRequest(record);
    },
    async listAutomationsForFacebookPage(workspaceId, pageId) {
      const records = await client.automation.findMany({
        where: { workspaceId, facebookPageId: pageId, status: "ACTIVE" },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      });
      return records.map(mapAutomation);
    },

    async recordExecution(input: RecordExecutionInput): Promise<RecordExecutionResult> {
      // Look up by (workspaceId, dedupeKey, externalEventId) first so a
      // concurrent retry of the same event finds its own row instead of a
      // stale leftover from an unrelated run that happens to share the key.
      const existing = await client.automationExecution.findFirst({
        where: {
          workspaceId: input.workspaceId,
          dedupeKey: input.dedupeKey,
          externalEventId: input.externalEventId,
        },
      });
      if (existing) {
        return { created: false, record: mapExecution(existing) };
      }
      try {
        const record = await client.automationExecution.create({
          data: { id: createId("execution"), ...input, dispatchStatus: input.dispatchStatus ?? "CLAIMED" },
        });
        return { created: true, record: mapExecution(record) };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        // Race: another writer committed between our precheck and our create.
        // Re-read by the same three-tuple; if a row still doesn't match
        // (the unique key collision is from a different externalEventId),
        // surface the error so the caller can retry with the correct key.
        const record = await client.automationExecution.findFirst({
          where: {
            workspaceId: input.workspaceId,
            dedupeKey: input.dedupeKey,
            externalEventId: input.externalEventId,
          },
        });
        if (!record) throw error;
        return { created: false, record: mapExecution(record) };
      }
    },

    async claimExecution(input) {
      try {
        await client.automationExecution.create({
          data: { id: createId("execution"), status: "PROCESSING", dispatchStatus: "CLAIMED", ...input },
        });
        return true;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
        throw error;
      }
    },

    async claimExecutionDispatch(input) {
      // Two callers share a dedupeKey: `recordExecution` first writes a
      // PROCESSING/CLAIMED row, then `claimExecutionDispatch` advances it
      // to DISPATCHING.
      //
      // dispatchOwner must be unique across all rows (the worker that
      // generates it treats it as a one-shot lease token). Reject reuse
      // before attempting to claim so a token recycled by mistake cannot
      // clobber an in-flight dispatch.
      const ownerTaken = await client.automationExecution.findFirst({
        where: { dispatchOwner: input.dispatchOwner },
        select: { id: true },
      });
      if (ownerTaken) return false;

      const dispatchStartedAt = new Date(input.dispatchStartedAt);
      const dispatchLeaseExpiresAt = new Date(input.dispatchLeaseExpiresAt);
      // The WHERE clause below encodes the entire claimability rule - a
      // separate read-then-upsert (the previous approach) leaves a window
      // between the read and the write where two concurrent callers can
      // both observe an unclaimed row and then both unconditionally
      // overwrite it via upsert's `update` branch, each getting back a
      // RETURNING row that looks like a successful claim. A single
      // `updateMany` with the claimability check inlined in `where` is
      // atomic per row (Postgres serializes concurrent UPDATEs on the same
      // row and re-evaluates WHERE against the committed state), so only
      // one caller's statement can ever match and flip the row - mirrors
      // the same compare-and-set pattern already used by
      // completeOwnedExecution/failAbandonedExecution below.
      const claimable = {
        workspaceId: input.workspaceId,
        dedupeKey: input.dedupeKey,
        status: "PROCESSING" as const,
        OR: [
          { dispatchStatus: { not: "DISPATCHING" as const } },
          { dispatchOwner: null },
          { dispatchOwner: input.dispatchOwner },
        ],
      };
      const claim = {
        dispatchStatus: "DISPATCHING" as const,
        dispatchOwner: input.dispatchOwner,
        dispatchStartedAt,
        dispatchLeaseExpiresAt,
      };
      const claimed = await client.automationExecution.updateMany({ where: claimable, data: claim });
      if (claimed.count === 1) return true;

      // No row matched: either recordExecution has not run yet for this key
      // (first claim), or one exists but is not currently claimable (e.g.
      // actively dispatched by a different owner - correctly leave it
      // alone). Try to create; a collision means the row already existed,
      // so re-run the same atomic conditional update to find out whether it
      // was ours to take.
      try {
        await client.automationExecution.create({
          data: {
            id: createId("execution"),
            status: "PROCESSING",
            dispatchStatus: "DISPATCHING",
            ...input,
            dispatchStartedAt,
            dispatchLeaseExpiresAt,
          },
        });
        return true;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        const retried = await client.automationExecution.updateMany({ where: claimable, data: claim });
        return retried.count === 1;
      }
    },

    async getExecution(workspaceId, dedupeKey) {
      const record = await client.automationExecution.findFirst({ where: { workspaceId, dedupeKey } });
      return record ? mapExecution(record) : null;
    },

    async completeExecution(workspaceId, dedupeKey, result) {
      await client.automationExecution.updateMany({
        where: { workspaceId, dedupeKey, status: "PROCESSING" },
        data: result,
      });
    },

    async completeOwnedExecution(workspaceId, dedupeKey, dispatchOwner, result) {
      const completed = await client.automationExecution.updateMany({
        where: {
          workspaceId,
          dedupeKey,
          status: "PROCESSING",
          dispatchStatus: "DISPATCHING",
          dispatchOwner,
        },
        data: result,
      });
      return completed.count === 1;
    },

    async failAbandonedExecution(workspaceId, dedupeKey, observedAt, reason) {
      const failed = await client.automationExecution.updateMany({
        where: {
          workspaceId,
          dedupeKey,
          status: "PROCESSING",
          dispatchStatus: "DISPATCHING",
          OR: [
            { dispatchOwner: null },
            { dispatchStartedAt: null },
            { dispatchLeaseExpiresAt: null },
            { dispatchLeaseExpiresAt: { lte: new Date(observedAt) } },
          ],
        },
        data: { status: "FAILED", reason },
      });
      return failed.count === 1;
    },

    async releaseExecutionClaim(workspaceId, dedupeKey) {
      await client.automationExecution.deleteMany({
        where: { workspaceId, dedupeKey, status: "PROCESSING" },
      });
    },

    async releaseOwnedExecutionClaim(workspaceId, dedupeKey, dispatchOwner) {
      const released = await client.automationExecution.deleteMany({
        where: {
          workspaceId,
          dedupeKey,
          status: "PROCESSING",
          dispatchStatus: "DISPATCHING",
          dispatchOwner,
        },
      });
      return released.count === 1;
    },

    async hasExecution(workspaceId, dedupeKey) {
      return Boolean(await client.automationExecution.findFirst({ where: { workspaceId, dedupeKey }, select: { id: true } }));
    },

    async listRecentOutboundFailures(workspaceId, limit) {
      const records = await client.outboundDelivery.findMany({
        where: { workspaceId, state: "FAILED" },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: limit,
      });
      return records.map(mapOutboundDelivery);
    },

    async ensureOutboundDelivery(input: EnsureOutboundDeliveryInput) {
      const existing = await client.outboundDelivery.findUnique({
        where: { deliveryKey: input.deliveryKey },
      });
      if (existing) return mapOutboundDelivery(existing);
      try {
        const record = await client.outboundDelivery.create({
          data: {
            id: createId("delivery"),
            ...input,
            payload: input.payload as Prisma.InputJsonValue,
          },
        });
        return mapOutboundDelivery(record);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
          throw error;
        }
        const winner = await client.outboundDelivery.findUniqueOrThrow({
          where: { deliveryKey: input.deliveryKey },
        });
        return mapOutboundDelivery(winner);
      }
    },

    async getOutboundDelivery(deliveryKey) {
      const record = await client.outboundDelivery.findUnique({ where: { deliveryKey } });
      return record ? mapOutboundDelivery(record) : null;
    },

    async claimOutboundDelivery(deliveryKey, owner, leaseUntil) {
      const updated = await client.outboundDelivery.updateMany({
        where: {
          deliveryKey,
          OR: [{ state: "PENDING" }, { state: "FAILED", retryable: true }],
        },
        data: {
          state: "CLAIMED",
          retryable: false,
          claimOwner: owner,
          claimExpiresAt: new Date(leaseUntil),
          attemptCount: { increment: 1 },
        },
      });
      const record = await client.outboundDelivery.findUniqueOrThrow({ where: { deliveryKey } });
      return { claimed: updated.count === 1, record: mapOutboundDelivery(record) };
    },

    async completeOutboundDelivery(deliveryKey, owner, providerMessageId, sentAt) {
      const updated = await client.outboundDelivery.updateMany({
        where: { deliveryKey, state: "CLAIMED", claimOwner: owner },
        data: {
          state: "SENT",
          retryable: false,
          resultCode: "DELIVERED",
          claimOwner: null,
          claimExpiresAt: null,
          providerMessageId: providerMessageId ?? null,
          lastError: null,
          sentAt: new Date(sentAt),
        },
      });
      return updated.count === 1;
    },

    async failOutboundDelivery(deliveryKey, owner, error, retryable, resultCode) {
      const updated = await client.outboundDelivery.updateMany({
        where: { deliveryKey, state: "CLAIMED", claimOwner: owner },
        data: {
          state: "FAILED",
          retryable,
          resultCode,
          claimOwner: null,
          claimExpiresAt: null,
          lastError: error,
        },
      });
      return updated.count === 1;
    },

    async markOutboundDeliveryUnknown(deliveryKey, owner, error) {
      const updated = await client.outboundDelivery.updateMany({
        where: {
          deliveryKey,
          state: "CLAIMED",
          ...(owner === undefined ? {} : { claimOwner: owner }),
        },
        data: {
          state: "UNKNOWN",
          retryable: false,
          resultCode: "AMBIGUOUS",
          claimOwner: null,
          claimExpiresAt: null,
          lastError: error,
        },
      });
      return updated.count === 1;
    },

    async listExpiredDeliveryClaims(nowIso, limit) {
      const records = await client.outboundDelivery.findMany({
        where: { state: "CLAIMED", claimExpiresAt: { lte: new Date(nowIso) } },
        orderBy: { claimExpiresAt: "asc" },
        take: Math.max(0, limit),
      });
      return records.map(mapOutboundDelivery);
    },

    async listOutboundDeliveryProblems(workspaceId, limit) {
      const records = await client.outboundDelivery.findMany({
        where: { workspaceId, state: { in: ["FAILED", "UNKNOWN"] } },
        orderBy: { updatedAt: "desc" },
        take: Math.min(100, Math.max(0, limit)),
      });
      return records.map(mapOutboundDelivery);
    },

    async claimAutomationSendSlots(automationId, utcDate, amount, limit) {
      validateQuotaRequest(utcDate, amount, limit);
      const rows = await client.$queryRaw<Array<{ reserved: number }>>`
        INSERT INTO "AutomationDailySendCounter" ("automationId", "utcDate", "reserved", "updatedAt")
        VALUES (${automationId}, ${utcDate}::date, ${amount}, NOW())
        ON CONFLICT ("automationId", "utcDate") DO UPDATE
        SET "reserved" = "AutomationDailySendCounter"."reserved" + EXCLUDED."reserved",
            "updatedAt" = NOW()
        WHERE "AutomationDailySendCounter"."reserved" + EXCLUDED."reserved" <= ${limit}
        RETURNING "reserved"
      `;
      return rows.length === 1;
    },

    async releaseAutomationSendSlots(automationId, utcDate, amount) {
      validateUtcDate(utcDate);
      validatePositiveInteger(amount, "amount");
      await client.$executeRaw`
        UPDATE "AutomationDailySendCounter"
        SET "reserved" = GREATEST(0, "reserved" - ${amount}),
            "updatedAt" = NOW()
        WHERE "automationId" = ${automationId}
          AND "utcDate" = ${utcDate}::date
      `;
    },

    async createParticipant(input: CreateParticipantInput) {
      try {
        const record = await client.automationParticipant.create({
          data: {
            id: createId("participant"),
            ...input,
            ...mapParticipantPatch(input),
            sourceMediaSnapshot: input.sourceMediaSnapshot as Prisma.InputJsonValue,
          },
        });
        return { created: true, record: mapParticipant(record) };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        const record = await client.automationParticipant.findFirstOrThrow({
          where: {
            workspaceId: input.workspaceId,
            instagramAccountId: input.instagramAccountId,
            sourceCommentId: input.sourceCommentId,
          },
        });
        return { created: false, record: mapParticipant(record) };
      }
    },

    async getParticipant(workspaceId, instagramAccountId, id) {
      const record = await client.automationParticipant.findFirst({
        where: { id, workspaceId, instagramAccountId },
      });
      return record ? mapParticipant(record) : null;
    },

    async findParticipantBySource(workspaceId, instagramAccountId, sourceCommentId) {
      const record = await client.automationParticipant.findFirst({
        where: { workspaceId, instagramAccountId, sourceCommentId },
      });
      return record ? mapParticipant(record) : null;
    },

    async findPendingParticipant(instagramAccountId, igScopedUserId) {
      const record = await client.automationParticipant.findFirst({
        where: {
          instagramAccountId,
          igScopedUserId,
          state: { notIn: ["LINK_SENT", "EXPIRED", "FAILED"] },
        },
        orderBy: { updatedAt: "desc" },
      });
      return record ? mapParticipant(record) : null;
    },

    async transitionParticipant(id, expectedStates, patch) {
      const result = await client.automationParticipant.updateMany({
        where: { id, state: { in: expectedStates } },
        data: mapParticipantPatch(patch),
      });
      if (result.count === 0) return null;
      const record = await client.automationParticipant.findUnique({ where: { id } });
      return record ? mapParticipant(record) : null;
    },

    async bindNextMedia(workspaceId, automationId, mediaId, publishedAt) {
      const result = await client.automation.updateMany({
        where: {
          id: automationId,
          workspaceId,
          status: "ACTIVE",
          boundMediaId: null,
          activatedAt: { lt: new Date(publishedAt) },
        },
        data: { boundMediaId: mediaId },
      });
      return result.count === 1;
    },

    async listParticipants(workspaceId, automationId, limit) {
      const records = await client.automationParticipant.findMany({
        where: { workspaceId, automationId },
        orderBy: { updatedAt: "desc" },
        take: limit,
      });
      return records.map(mapParticipant);
    },

    async listRecentParticipants(workspaceId, limit, automationId) {
      const records = await client.automationParticipant.findMany({
        where: { workspaceId, ...(automationId ? { automationId } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: limit,
      });
      return records.map(mapParticipant);
    },

    async countExecutionsByStatusPerAutomation(workspaceId, sinceIso) {
      const grouped = await client.automationExecution.groupBy({
        by: ["automationId", "status"],
        where: { workspaceId, createdAt: { gte: new Date(sinceIso) }, status: { in: ["SENT", "FAILED", "SKIPPED"] } },
        _count: { _all: true },
      });
      const tallies = new Map<string, { automationId: string; sent: number; failed: number; skipped: number }>();
      for (const entry of grouped) {
        const tally = tallies.get(entry.automationId) ?? { automationId: entry.automationId, sent: 0, failed: 0, skipped: 0 };
        if (entry.status === "SENT") tally.sent += entry._count._all;
        else if (entry.status === "FAILED") tally.failed += entry._count._all;
        else tally.skipped += entry._count._all;
        tallies.set(entry.automationId, tally);
      }
      return [...tallies.values()];
    },

    async expireParticipantsByInstagramAccount(instagramAccountId, reason) {
      const result = await client.automationParticipant.updateMany({
        where: {
          instagramAccountId,
          state: { notIn: ["LINK_SENT", "EXPIRED", "FAILED"] },
        },
        data: { state: "EXPIRED", finalDeliveryError: reason },
      });
      return result.count;
    },

    async deleteParticipantsByWorkspaceIds(workspaceIds) {
      if (workspaceIds.length === 0) return 0;
      const result = await client.automationParticipant.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      return result.count;
    },

    async expireStaleParticipants(now, reason) {
      const result = await client.automationParticipant.updateMany({
        where: {
          state: { notIn: ["LINK_SENT", "EXPIRED", "FAILED"] },
          messagingWindowExpiresAt: { not: null, lte: new Date(now) },
        },
        data: { state: "EXPIRED", finalDeliveryError: reason },
      });
      return result.count;
    },

    async deleteStaleTerminalParticipants(before) {
      const result = await client.automationParticipant.deleteMany({
        where: {
          state: { in: ["LINK_SENT", "EXPIRED", "FAILED"] },
          updatedAt: { lt: new Date(before) },
        },
      });
      return result.count;
    },

    async touchContact(workspaceId, instagramAccountId, igScopedUserId, seenAt) {
      const existing = await client.automationContact.findUnique({
        where: {
          workspaceId_instagramAccountId_igScopedUserId: { workspaceId, instagramAccountId, igScopedUserId },
        },
      });
      if (existing) {
        const updated = await client.automationContact.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date(seenAt) },
        });
        return { created: false, record: mapContact(updated) };
      }
      try {
        const created = await client.automationContact.create({
          data: {
            id: createId("contact"),
            workspaceId,
            instagramAccountId,
            igScopedUserId,
            lastSeenAt: new Date(seenAt),
          },
        });
        return { created: true, record: mapContact(created) };
      } catch (error) {
        // Lost a create race with a concurrent webhook delivery for the same sender -
        // the sender exists, so this is not their first contact.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        const record = await client.automationContact.findUniqueOrThrow({
          where: {
            workspaceId_instagramAccountId_igScopedUserId: { workspaceId, instagramAccountId, igScopedUserId },
          },
        });
        return { created: false, record: mapContact(record) };
      }
    },

    async getContact(workspaceId, instagramAccountId, igScopedUserId) {
      const record = await client.automationContact.findUnique({
        where: {
          workspaceId_instagramAccountId_igScopedUserId: { workspaceId, instagramAccountId, igScopedUserId },
        },
      });
      return record ? mapContact(record) : null;
    },

    async setContactAwaitingEmail(workspaceId, instagramAccountId, igScopedUserId, automationId, atIso) {
      const updated = await client.automationContact.update({
        where: {
          workspaceId_instagramAccountId_igScopedUserId: { workspaceId, instagramAccountId, igScopedUserId },
        },
        data: {
          state: "AWAITING_EMAIL",
          awaitingAutomationId: automationId,
          awaitingSince: new Date(atIso),
          attempts: 0,
        },
      });
      return mapContact(updated);
    },

    async captureContactEmail(workspaceId, instagramAccountId, igScopedUserId, email, atIso) {
      const normalized = email.trim().toLowerCase();
      const current = await client.automationContact.findUniqueOrThrow({
        where: {
          workspaceId_instagramAccountId_igScopedUserId: { workspaceId, instagramAccountId, igScopedUserId },
        },
      });
      const updated = await client.automationContact.update({
        where: { id: current.id },
        data: {
          email: normalized,
          state: current.state === "AWAITING_EMAIL" ? "AWAITING_EMAIL" : "CAPTURED",
          ...(current.state === "AWAITING_EMAIL" ? {} : {
            awaitingAutomationId: null,
            awaitingSince: null,
          }),
          attempts: 0,
          tags: current.tags.includes("email_captured") ? undefined : { push: "email_captured" },
          score: Math.min(current.score + 10, 9999),
          lastSeenAt: new Date(Math.max(new Date(atIso).getTime(), current.lastSeenAt.getTime())),
        },
      });
      return mapContact(updated);
    },

    async bumpContactEmailAttempt(workspaceId, instagramAccountId, igScopedUserId) {
      const current = await client.automationContact.findUniqueOrThrow({
        where: {
          workspaceId_instagramAccountId_igScopedUserId: { workspaceId, instagramAccountId, igScopedUserId },
        },
      });
      const updated = await client.automationContact.update({
        where: { id: current.id },
        data: { attempts: { increment: 1 } },
      });
      return updated.attempts;
    },

    async clearContactAwaitingEmail(workspaceId, instagramAccountId, igScopedUserId) {
      const current = await client.automationContact.findUnique({
        where: {
          workspaceId_instagramAccountId_igScopedUserId: { workspaceId, instagramAccountId, igScopedUserId },
        },
      });
      if (!current) return;
      await client.automationContact.update({
        where: { id: current.id },
        data: {
          state: current.email ? "CAPTURED" : "NONE",
          awaitingAutomationId: null,
          awaitingSince: null,
          awaitingFields: Prisma.DbNull,
        },
      });
    },

    async beginContactFieldCollection(workspaceId, instagramAccountId, igScopedUserId, remainingFields, automationId, atIso) {
      const updated = await client.automationContact.update({
        where: {
          workspaceId_instagramAccountId_igScopedUserId: { workspaceId, instagramAccountId, igScopedUserId },
        },
        data: {
          state: "AWAITING_FIELD",
          awaitingAutomationId: automationId,
          awaitingSince: new Date(atIso),
          awaitingFields: remainingFields,
        },
      });
      return mapContact(updated);
    },

    async recordContactFieldAnswer(workspaceId, instagramAccountId, igScopedUserId, fieldId, answer, remainingAfter, atIso) {
      const current = await client.automationContact.findUniqueOrThrow({
        where: {
          workspaceId_instagramAccountId_igScopedUserId: { workspaceId, instagramAccountId, igScopedUserId },
        },
      });
      const existingFields = (current.fields ?? {}) as Record<string, string>;
      const updated = await client.automationContact.update({
        where: { id: current.id },
        data: {
          fields: { ...existingFields, [fieldId]: answer.trim().slice(0, 200) },
          awaitingFields: remainingAfter,
          state: remainingAfter.length > 0 ? "AWAITING_FIELD" : "CAPTURED",
          ...(remainingAfter.length === 0 ? { awaitingAutomationId: null, awaitingSince: null } : {}),
          lastSeenAt: new Date(Math.max(new Date(atIso).getTime(), current.lastSeenAt.getTime())),
        },
      });
      return mapContact(updated);
    },

    async suppressContact(workspaceId, instagramAccountId, igScopedUserId, atIso) {
      const current = await client.automationContact.findUniqueOrThrow({
        where: {
          workspaceId_instagramAccountId_igScopedUserId: { workspaceId, instagramAccountId, igScopedUserId },
        },
      });
      const updated = await client.automationContact.update({
        where: { id: current.id },
        data: {
          suppressedAt: current.suppressedAt ?? new Date(atIso),
          state: current.email ? "CAPTURED" : "NONE",
          awaitingAutomationId: null,
          awaitingSince: null,
          awaitingFields: Prisma.DbNull,
          tags: current.tags.includes("opted_out") ? undefined : { push: "opted_out" },
          lastSeenAt: new Date(Math.max(new Date(atIso).getTime(), current.lastSeenAt.getTime())),
        },
      });
      await client.sequenceEnrollment.updateMany({
        where: { contactId: current.id, state: "ACTIVE" },
        data: { state: "CANCELLED" },
      });
      return mapContact(updated);
    },

    async countCapturedContacts(workspaceId) {
      return client.automationContact.count({
        where: { workspaceId, state: "CAPTURED", email: { not: null } },
      });
    },

    async listCapturedContacts(workspaceId, limit): Promise<CapturedContactSummary[]> {
      const records = await client.automationContact.findMany({
        where: { workspaceId, state: "CAPTURED", email: { not: null } },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: limit,
      });
      return records.map((record) => ({
        id: record.id,
        email: record.email!,
        instagramAccountId: record.instagramAccountId,
        capturedAt: record.updatedAt.toISOString(),
      }));
    },

    async countSuppressedContacts(workspaceId) {
      return client.automationContact.count({ where: { workspaceId, suppressedAt: { not: null } } });
    },

    async getContactById(workspaceId, contactId) {
      const record = await client.automationContact.findFirst({ where: { id: contactId, workspaceId } });
      return record ? mapContact(record) : null;
    },

    async setContactTags(workspaceId, instagramAccountId, igScopedUserId, tags) {
      const current = await client.automationContact.findUnique({
        where: {
          workspaceId_instagramAccountId_igScopedUserId: { workspaceId, instagramAccountId, igScopedUserId },
        },
      });
      if (!current) return null;
      // Manual tags replace previous manual tags; automatic labels always survive.
      const automatic = current.tags.filter((tag) => (AUTOMATIC_CONTACT_TAGS as readonly string[]).includes(tag));
      const manual = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]
        .filter((tag) => !(AUTOMATIC_CONTACT_TAGS as readonly string[]).includes(tag))
        .slice(0, 20);
      const updated = await client.automationContact.update({
        where: { id: current.id },
        data: { tags: [...automatic, ...manual] },
      });
      return mapContact(updated);
    },

    async addContactTags(workspaceId, instagramAccountId, igScopedUserId, tags) {
      const current = await client.automationContact.findUnique({
        where: {
          workspaceId_instagramAccountId_igScopedUserId: { workspaceId, instagramAccountId, igScopedUserId },
        },
      });
      if (!current) return null;
      const merged = [...new Set([...current.tags, ...tags.map((t) => t.trim().toLowerCase()).filter(Boolean)])].slice(0, 30);
      if (merged.length === current.tags.length) return mapContact(current);
      const updated = await client.automationContact.update({
        where: { id: current.id },
        data: { tags: merged },
      });
      return mapContact(updated);
    },

    async bumpContactScore(workspaceId, instagramAccountId, igScopedUserId, delta) {
      const current = await client.automationContact.findUnique({
        where: {
          workspaceId_instagramAccountId_igScopedUserId: { workspaceId, instagramAccountId, igScopedUserId },
        },
      });
      if (!current) return -1;
      const updated = await client.automationContact.update({
        where: { id: current.id },
        data: { score: Math.min(Math.max(current.score + delta, 0), 9999) },
      });
      return updated.score;
    },

    async getContactTimeline(workspaceId, contactId, limit): Promise<ContactTimelineEntry[]> {
      const contact = await client.automationContact.findFirst({ where: { id: contactId, workspaceId } });
      if (!contact) return [];
      const [participants, enrollments] = await Promise.all([
        client.automationParticipant.findMany({
          where: {
            workspaceId,
            instagramAccountId: contact.instagramAccountId,
            igScopedUserId: contact.igScopedUserId,
          },
          orderBy: [{ createdAt: "desc" }],
          take: limit,
          select: { id: true, state: true, matchedKeyword: true, createdAt: true },
        }),
        client.sequenceEnrollment.findMany({
          where: { workspaceId, contactId: contact.id },
          orderBy: [{ enrolledAt: "desc" }],
          take: limit,
          include: { sequence: { select: { name: true } } },
        }),
      ]);
      const entries: ContactTimelineEntry[] = participants.map((participant) => ({
        id: `participant:${participant.id}`,
        kind: "interaction" as const,
        at: participant.createdAt.toISOString(),
        label: participant.state === "LINK_SENT" ? "Campaign delivery sent" : "Campaign interaction",
        detail: participant.matchedKeyword ? `keyword "${participant.matchedKeyword}"` : participant.state,
      }));
      for (const enrollment of enrollments) {
        entries.push({
          id: `enrollment:${enrollment.id}`,
          kind: "sequence",
          at: enrollment.enrolledAt.toISOString(),
          label: "Sequence enrollment",
          detail: enrollment.sequence?.name ?? enrollment.sequenceId,
        });
      }
      if (contact.email) {
        entries.push({ id: "milestone:email", kind: "email_captured", at: contact.updatedAt.toISOString(), label: "Email captured", detail: contact.email });
      }
      if (contact.suppressedAt) {
        entries.push({ id: "milestone:optout", kind: "opted_out", at: contact.suppressedAt.toISOString(), label: "Opted out" });
      }
      return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
    },

    async updateContactProfile(workspaceId, contactId, patch) {
      const current = await client.automationContact.findFirst({ where: { id: contactId, workspaceId } });
      if (!current) return null;
      const data: Prisma.AutomationContactUncheckedUpdateInput = {};
      let scoreDelta = 0;
      if (patch.leadStatus && patch.leadStatus !== current.leadStatus) {
        data.leadStatus = patch.leadStatus;
        scoreDelta = LEAD_STATUS_SCORE_DELTA[patch.leadStatus] - LEAD_STATUS_SCORE_DELTA[current.leadStatus];
      }
      if (patch.assigneeUserId !== undefined) {
        data.assigneeUserId = patch.assigneeUserId || null;
      }
      if (patch.notes !== undefined) {
        const trimmed = patch.notes?.trim();
        data.notes = trimmed ? trimmed.slice(0, 4000) : null;
      }
      if (patch.sourceAutomationId !== undefined) {
        data.sourceAutomationId = patch.sourceAutomationId || null;
      }
      if (Object.keys(data).length === 0 && scoreDelta === 0) return mapContact(current);
      if (scoreDelta !== 0) {
        data.score = Math.min(Math.max(current.score + scoreDelta, 0), 9999);
      }
      const updated = await client.automationContact.update({ where: { id: current.id }, data });
      return mapContact(updated);
    },

    async countContactsByLeadStatus(workspaceId) {
      const rows = await client.automationContact.groupBy({
        by: ["leadStatus"],
        where: { workspaceId },
        _count: { _all: true },
      });
      const counts: Record<LeadStatus, number> = { NEW: 0, ENGAGED: 0, QUALIFIED: 0, CUSTOMER: 0 };
      for (const row of rows) counts[row.leadStatus] = row._count._all;
      return counts;
    },

    async listContactsByLeadStatus(workspaceId, options) {
      const records = await client.automationContact.findMany({
        where: { workspaceId, ...(options.leadStatus ? { leadStatus: options.leadStatus } : {}) },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: options.limit,
      });
      return records.map(mapContact);
    },

    async countParticipantsByVariant(workspaceId, automationId) {
      const [rows, deliveredRows, clickedRows] = await Promise.all([
        client.automationParticipant.groupBy({
          by: ["variantLabel"],
          where: { workspaceId, automationId },
          _count: { _all: true },
        }),
        client.automationParticipant.groupBy({
          by: ["variantLabel"],
          where: { workspaceId, automationId, finalDeliveryStatus: "SENT" },
          _count: { _all: true },
        }),
        client.automationParticipant.groupBy({
          by: ["variantLabel"],
          where: { workspaceId, automationId, deliveryClickedAt: { not: null } },
          _count: { _all: true },
        }),
      ]);
      const deliveredByVariant = new Map(deliveredRows.map((row) => [row.variantLabel ?? "A", row._count._all]));
      const clickedByVariant = new Map(clickedRows.map((row) => [row.variantLabel ?? "A", row._count._all]));
      return rows
        .map((row) => ({
          variant: row.variantLabel ?? "A",
          participants: row._count._all,
          delivered: deliveredByVariant.get(row.variantLabel ?? "A") ?? 0,
          clicked: clickedByVariant.get(row.variantLabel ?? "A") ?? 0,
        }))
        .sort((a, b) => a.variant.localeCompare(b.variant));
    },

    async recordWebhookEvent(workspaceId, input) {
      try {
        await client.webhookEvent.create({
          data: {
            id: createId("wevent"),
            workspaceId,
            providerEventId: input.providerEventId,
            eventType: input.eventType,
            receivedAt: new Date(input.receivedAt),
            payload: input.payload as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        // Unique (workspaceId, providerEventId) replays are expected and harmless.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      }
    },

    async listRecentWebhookEvents(workspaceId, limit, eventType) {
      const records = await client.webhookEvent.findMany({
        where: { workspaceId, ...(eventType ? { eventType } : {}) },
        orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
        take: limit,
      });
      return records.map((record) => ({
        id: record.id,
        providerEventId: record.providerEventId,
        eventType: record.eventType,
        receivedAt: record.receivedAt.toISOString(),
        ...(record.processedAt ? { processedAt: record.processedAt.toISOString() } : {}),
        payload: record.payload as Record<string, unknown>,
      }));
    },

    async deleteOldWebhookEvents(before) {
      const result = await client.webhookEvent.deleteMany({ where: { receivedAt: { lt: new Date(before) } } });
      return result.count;
    },

    async deleteContactsByWorkspaceIds(workspaceIds) {
      if (workspaceIds.length === 0) return 0;
      const result = await client.automationContact.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      return result.count;
    },

    async deleteAutomation(workspaceId, id) {
      const result = await client.automation.deleteMany({ where: { workspaceId, id } });
      return result.count > 0;
    },

    async snapshotAutomation(workspaceId, id, snapshotBy) {
      const current = await client.automation.findFirst({ where: { id, workspaceId } });
      if (!current) return null;
      const aggregate = await client.automationVersion.aggregate({
        where: { automationId: id },
        _max: { version: true },
      });
      const nextNumber = (aggregate._max.version ?? 0) + 1;
      const created = await client.automationVersion.create({
        data: {
          id: createId("autover"),
          automationId: id,
          workspaceId,
          version: nextNumber,
          name: current.name,
          definition: current.definition as Prisma.InputJsonValue,
          // Capture activation-time state so a restore is exact.
          status: current.status,
          priority: current.priority,
          ...(current.activatedAt ? { activatedAt: current.activatedAt } : {}),
          ...(current.boundMediaId ? { boundMediaId: current.boundMediaId } : {}),
          ...(current.instagramAccountId ? { instagramAccountId: current.instagramAccountId } : {}),
          ...(current.facebookPageId ? { facebookPageId: current.facebookPageId } : {}),
          ...(snapshotBy ? { snapshotBy } : {}),
        },
      });
      return mapAutomationVersion(created);
    },

    async listAutomationVersions(workspaceId, automationId, limit) {
      const records = await client.automationVersion.findMany({
        where: { automationId, workspaceId },
        orderBy: [{ version: "desc" }, { id: "asc" }],
        take: limit,
      });
      return records.map(mapAutomationVersion);
    },

    async getAutomationVersion(workspaceId, automationId, versionId) {
      const record = await client.automationVersion.findFirst({
        where: { id: versionId, automationId, workspaceId },
      });
      return record ? mapAutomationVersion(record) : null;
    },

    async restoreAutomationVersion(workspaceId, automationId, versionId, restoredBy) {
      const current = await client.automation.findFirst({ where: { id: automationId, workspaceId } });
      if (!current) return null;
      const target = await client.automationVersion.findFirst({
        where: { id: versionId, automationId, workspaceId },
      });
      if (!target) return null;
      // Capture the pre-restore state so the history remains append-only.
      const aggregate = await client.automationVersion.aggregate({
        where: { automationId },
        _max: { version: true },
      });
      const nextNumber = (aggregate._max.version ?? 0) + 1;
      await client.automationVersion.create({
        data: {
          id: createId("autover"),
          automationId,
          workspaceId,
          version: nextNumber,
          name: current.name,
          definition: current.definition as Prisma.InputJsonValue,
          status: current.status,
          priority: current.priority,
          ...(current.activatedAt ? { activatedAt: current.activatedAt } : {}),
          ...(current.boundMediaId ? { boundMediaId: current.boundMediaId } : {}),
          ...(current.instagramAccountId ? { instagramAccountId: current.instagramAccountId } : {}),
          ...(current.facebookPageId ? { facebookPageId: current.facebookPageId } : {}),
          snapshotBy: restoredBy ?? "restore",
        },
      });
      const targetDefinition = target.definition as Prisma.InputJsonValue;
      const targetVersionNumber = (target.definition as { version?: number }).version ?? 1;
      // Restore the full state, not just name + definition. Without
      // status/activatedAt/boundMediaId the restored automation would
      // behave like a freshly-edited DRAFT and silently miss its
      // next-media binding (the publishedAt > activatedAt resolver would
      // pass against an old activatedAt or a missing boundMediaId).
      const updated = await client.automation.update({
        where: { id: automationId },
        data: {
          name: target.name,
          definition: targetDefinition,
          version: Math.max(current.version, targetVersionNumber) + 1,
          status: target.status,
          priority: target.priority,
          ...(target.activatedAt ? { activatedAt: target.activatedAt } : { activatedAt: null }),
          ...(target.boundMediaId ? { boundMediaId: target.boundMediaId } : { boundMediaId: null }),
          ...(target.instagramAccountId ? { instagramAccountId: target.instagramAccountId } : { instagramAccountId: null }),
          ...(target.facebookPageId ? { facebookPageId: target.facebookPageId } : { facebookPageId: null }),
        },
      });
      return mapAutomation(updated);
    },

    async createSequence(workspaceId, input) {
      const created = await client.automationSequence.create({
        data: {
          id: createId("sequence"),
          workspaceId,
          name: input.name.trim(),
          status: input.status,
          steps: input.steps,
          ...(input.sourceAutomationId ? { sourceAutomationId: input.sourceAutomationId } : {}),
        },
      });
      return mapSequenceRow(created);
    },

    async getSequence(workspaceId, id) {
      const record = await client.automationSequence.findFirst({ where: { workspaceId, id } });
      if (!record) return null;
      return mapSequenceRow(record);
    },

    async updateSequence(workspaceId, id, patch) {
      const updated = await client.automationSequence.updateMany({
        where: { workspaceId, id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.steps !== undefined ? { steps: patch.steps } : {}),
          ...(patch.sourceAutomationId !== undefined ? { sourceAutomationId: patch.sourceAutomationId || null } : {}),
        },
      });
      if (updated.count === 0) return null;
      return this.getSequence(workspaceId, id);
    },

    async deleteSequence(workspaceId, id) {
      const result = await client.automationSequence.deleteMany({ where: { workspaceId, id } });
      return result.count > 0;
    },

    async listSequences(workspaceId) {
      const records = await client.automationSequence.findMany({
        where: { workspaceId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      });
      return records.map(mapSequenceRow);
    },

    async listActiveSequencesForSource(workspaceId, sourceAutomationId) {
      const records = await client.automationSequence.findMany({
        where: { workspaceId, status: "ACTIVE", sourceAutomationId },
      });
      return records
        .map(mapSequenceRow)
        .filter((sequence) => sequence.steps.length > 0);
    },

    async countEnrollmentsBySequence(workspaceId): Promise<SequenceEnrollmentCount[]> {
      const grouped = await client.sequenceEnrollment.groupBy({
        by: ["sequenceId"],
        where: { workspaceId, state: { not: "CANCELLED" } },
        _count: { _all: true },
      });
      return grouped.map((entry) => ({ sequenceId: entry.sequenceId, count: entry._count._all }));
    },

    async enrollContactInSequence(workspaceId, sequenceId, contactId, firstDelayHours, nowIso) {
      const [sequence, contact] = await Promise.all([
        client.automationSequence.findFirst({ where: { id: sequenceId, workspaceId } }),
        client.automationContact.findFirst({ where: { id: contactId, workspaceId } }),
      ]);
      if (!sequence || !contact) return { created: false };
      const existing = await client.sequenceEnrollment.findUnique({
        where: { sequenceId_contactId: { sequenceId, contactId } },
      });
      if (existing) return { created: false };
      try {
        await client.sequenceEnrollment.create({
          data: {
            id: createId("enrollment"),
            workspaceId,
            sequenceId,
            contactId,
            nextSendAt: new Date(Date.parse(nowIso) + firstDelayHours * 3_600_000),
          },
        });
        return { created: true };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        return { created: false };
      }
    },

    async listDueSequenceSends(nowIso, limit): Promise<DueSequenceSend[]> {
      const enrollments = await client.sequenceEnrollment.findMany({
        where: { state: "ACTIVE", nextSendAt: { lte: new Date(nowIso) } },
        orderBy: { nextSendAt: "asc" },
        take: limit,
      });
      const due: DueSequenceSend[] = [];
      for (const enrollment of enrollments) {
        const sequenceRow = await client.automationSequence.findUnique({ where: { id: enrollment.sequenceId } });
        const contactRow = await client.automationContact.findUnique({ where: { id: enrollment.contactId } });
        if (!sequenceRow || !contactRow || contactRow.suppressedAt) continue;
        if (sequenceRow.workspaceId !== enrollment.workspaceId) continue;
        if (sequenceRow.status !== "ACTIVE") continue;
        due.push({
          enrollment: {
            ...enrollment,
            state: enrollment.state as SequenceEnrollmentRecord["state"],
            nextSendAt: enrollment.nextSendAt?.toISOString(),
            enrolledAt: enrollment.enrolledAt.toISOString(),
            updatedAt: enrollment.updatedAt.toISOString(),
          },
          sequence: mapSequenceRow(sequenceRow),
          contact: mapContact(contactRow),
        });
      }
      return due;
    },

    async advanceSequenceEnrollment(id, nextIndex, nextSendAtIso) {
      await client.sequenceEnrollment.update({
        where: { id },
        data: {
          currentStepIndex: nextIndex,
          nextSendAt: nextSendAtIso ? new Date(nextSendAtIso) : null,
          state: nextSendAtIso ? "ACTIVE" : "COMPLETED",
        },
      });
    },

    async cancelEnrollmentsForContact(contactId) {
      const result = await client.sequenceEnrollment.updateMany({
        where: { contactId, state: "ACTIVE" },
        data: { state: "CANCELLED" },
      });
      return result.count;
    },

    async createBroadcast(workspaceId, input) {
      const created = await client.broadcast.create({
        data: {
          id: createId("broadcast"),
          workspaceId,
          name: input.name.trim(),
          text: input.text,
          segment: input.segment,
          status: input.status ?? (input.total > 0 ? "RUNNING" : "COMPLETED"),
          total: input.total,
          ...(input.total > 0 ? {} : { completedAt: new Date() }),
        },
      });
      return mapBroadcastRow(created);
    },

    async getBroadcast(workspaceId, id) {
      const record = await client.broadcast.findFirst({ where: { workspaceId, id } });
      if (!record) return null;
      return mapBroadcastRow(record);
    },

    async listBroadcasts(workspaceId, limit) {
      const records = await client.broadcast.findMany({
        where: { workspaceId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: limit,
      });
      return records.map(mapBroadcastRow);
    },

    async incrementBroadcastCounters(id, delta) {
      await client.broadcast.update({
        where: { id },
        data: {
          sent: { increment: delta.sent ?? 0 },
          failed: { increment: delta.failed ?? 0 },
          skipped: { increment: delta.skipped ?? 0 },
        },
      });
    },

    async finalizeBroadcastIfDone(workspaceId, id) {
      const broadcast = await client.broadcast.findFirst({ where: { workspaceId, id } });
      if (!broadcast || broadcast.status !== "RUNNING") return;
      if (broadcast.sent + broadcast.failed + broadcast.skipped < broadcast.total) return;
      await client.broadcast.update({ where: { id: broadcast.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    },

    async reconcileBroadcastCounters(workspaceId, broadcastId) {
      return client.$transaction(async (transaction) => {
        const groups = await transaction.outboundDelivery.groupBy({
          by: ["state", "resultCode"],
          where: { workspaceId, broadcastId },
          _count: { _all: true },
        });
        const counters = { total: 0, sent: 0, failed: 0, skipped: 0, pending: 0 };
        for (const group of groups) {
          const count = group._count._all;
          counters.total += count;
          if (group.state === "SENT" || group.resultCode === "DELIVERED") {
            counters.sent += count;
          } else if (group.resultCode === "SUPPRESSED" || group.resultCode === "WINDOW_CLOSED") {
            counters.skipped += count;
          } else if (group.state === "FAILED" && group.resultCode !== "RETRYABLE_REJECTION") {
            counters.failed += count;
          } else {
            counters.pending += count;
          }
        }
        const completed = counters.pending === 0;
        await transaction.broadcast.updateMany({
          where: { id: broadcastId, workspaceId },
          data: {
            total: counters.total,
            sent: counters.sent,
            failed: counters.failed,
            skipped: counters.skipped,
            status: completed ? "COMPLETED" : "RUNNING",
            completedAt: completed ? new Date() : null,
          },
        });
        return counters;
      });
    },

    async getMessagingWindow(workspaceId) {
      const row = await client.workspace.findUnique({
        where: { id: workspaceId },
        select: { quietStartHour: true, quietEndHour: true, timezone: true },
      });
      return toMessagingWindow(row);
    },

    async setMessagingWindow(workspaceId, window) {
      await client.workspace.update({
        where: { id: workspaceId },
        data: window
          ? { quietStartHour: window.startHour, quietEndHour: window.endHour, timezone: window.timezone }
          : { quietStartHour: null, quietEndHour: null, timezone: null },
      });
    },

    async listBroadcastRecipients(workspaceId, segment, limit) {
      const cutoff = broadcastSegmentCutoff(segment, new Date());
      const records = await client.automationContact.findMany({
        where: {
          workspaceId,
          suppressedAt: null,
          ...(cutoff ? { lastSeenAt: { lt: cutoff } } : {}),
          ...(segment === "captured_email" ? { state: "CAPTURED", email: { not: null } } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: limit,
        select: { igScopedUserId: true, instagramAccountId: true },
      });
      return records;
    },

    async createTrackedLink(workspaceId, input) {
      const record = await client.trackedLink.create({
        data: {
          id: input.id ?? createId("tlink"),
          workspaceId,
          slug: input.slug,
          destination: input.destination,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          utmSource: input.utmSource ?? null,
          utmMedium: input.utmMedium ?? null,
          utmCampaign: input.utmCampaign ?? null,
          utmTerm: input.utmTerm ?? null,
          utmContent: input.utmContent ?? null,
          conversionUrl: input.conversionUrl ?? null,
          notes: input.notes ?? null,
          createdByUserId: input.createdByUserId ?? null,
        },
      });
      return mapTrackedLink(record);
    },

    async getTrackedLinkBySlug(workspaceId, slug) {
      const record = await client.trackedLink.findUnique({ where: { workspaceId_slug: { workspaceId, slug } } });
      return record ? mapTrackedLink(record) : null;
    },

    async getTrackedLinkBySlugPublic(slug) {
      const record = await client.trackedLink.findFirst({ where: { slug } });
      return record ? mapTrackedLink(record) : null;
    },

    async listTrackedLinks(workspaceId, limit) {
      const records = await client.trackedLink.findMany({
        where: { workspaceId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: limit,
      });
      return records.map(mapTrackedLink);
    },

    async deleteTrackedLink(workspaceId, id) {
      const result = await client.trackedLink.deleteMany({ where: { workspaceId, id } });
      return result.count > 0;
    },

    async recordTrackedLinkClick(linkId, input) {
      const record = await client.trackedLinkClick.create({
        data: {
          id: createId("tlink_click"),
          linkId,
          workspaceId: input.workspaceId,
          ipHash: input.ipHash,
          userAgent: input.userAgent ?? null,
          country: input.country ?? null,
        },
      });
      return mapTrackedLinkClick(record);
    },

    async getTrackedLinkStats(workspaceId, id) {
      const link = await client.trackedLink.findFirst({ where: { id, workspaceId } });
      if (!link) return null;
      const [total, last, countryRows] = await Promise.all([
        client.trackedLinkClick.count({ where: { linkId: id } }),
        client.trackedLinkClick.findFirst({ where: { linkId: id }, orderBy: { clickedAt: "desc" } }),
        client.trackedLinkClick.groupBy({
          by: ["country"],
          where: { linkId: id, country: { not: null } },
          _count: { _all: true },
        }),
      ]);
      // Unique clicks are deduplicated via the salted IP hash.
      const uniqueRows = await client.trackedLinkClick.groupBy({
        by: ["ipHash"],
        where: { linkId: id },
        _count: { _all: true },
      });
      const stats: TrackedLinkStats = {
        link: mapTrackedLink(link),
        totalClicks: total,
        uniqueClicks: uniqueRows.length,
        ...(last ? { lastClickedAt: last.clickedAt.toISOString() } : {}),
        topCountries: countryRows
          .map((row) => ({ country: row.country as string, count: row._count._all }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
      };
      return stats;
    },
  };
}

function mapTrackedLink(record: {
  id: string;
  workspaceId: string;
  slug: string;
  destination: string;
  expiresAt: Date | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  conversionUrl: string | null;
  notes: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TrackedLinkRecord {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    slug: record.slug,
    destination: record.destination,
    ...(record.expiresAt ? { expiresAt: record.expiresAt.toISOString() } : {}),
    ...(record.utmSource ? { utmSource: record.utmSource } : {}),
    ...(record.utmMedium ? { utmMedium: record.utmMedium } : {}),
    ...(record.utmCampaign ? { utmCampaign: record.utmCampaign } : {}),
    ...(record.utmTerm ? { utmTerm: record.utmTerm } : {}),
    ...(record.utmContent ? { utmContent: record.utmContent } : {}),
    ...(record.conversionUrl ? { conversionUrl: record.conversionUrl } : {}),
    ...(record.notes ? { notes: record.notes } : {}),
    ...(record.createdByUserId ? { createdByUserId: record.createdByUserId } : {}),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapTrackedLinkClick(record: {
  id: string;
  linkId: string;
  workspaceId: string;
  ipHash: string;
  userAgent: string | null;
  country: string | null;
  clickedAt: Date;
}): TrackedLinkClickRecord {
  return {
    id: record.id,
    linkId: record.linkId,
    workspaceId: record.workspaceId,
    ipHash: record.ipHash,
    ...(record.userAgent ? { userAgent: record.userAgent } : {}),
    ...(record.country ? { country: record.country } : {}),
    clickedAt: record.clickedAt.toISOString(),
  };
}
