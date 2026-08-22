import { Prisma, PrismaClient } from "@prisma/client";
import { createId } from "./id";
import type {
  AutomationRecord,
  AutomationParticipantRecord,
  AutomationRepository,
  CreateAutomationInput,
  CreateParticipantInput,
  ExecutionDispatchStatus,
  ExecutionRecord,
  InstagramConnectionRecord,
  RecordExecutionInput,
  RecordExecutionResult,
  UpdateAutomationInput,
  DataDeletionRequestRecord,
  ParticipantPatch,
  ParticipantState,
  AuthTokenType,
  AuthTokenRecord,
  MemberRole,
  MemberRecord,
  InvitationRecord,
  AutomationContactRecord,
  CapturedContactSummary,
  AutomationSequenceRecord,
  SequenceStep,
  SequenceEnrollmentRecord,
  EnrollmentState,
  SequenceEnrollmentCount,
  DueSequenceSend,
  BroadcastRecord,
  MessagingWindow,
} from "./repository";
import type { EmailCaptureField } from "./automation/types";

function mapUser(record: {
  id: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  tokenVersion: number;
  createdAt: Date;
}) {
  return {
    id: record.id,
    email: record.email,
    passwordHash: record.passwordHash,
    emailVerifiedAt: record.emailVerifiedAt?.toISOString(),
    tokenVersion: record.tokenVersion,
    createdAt: record.createdAt.toISOString(),
  };
}

function mapAuthToken(record: {
  id: string;
  userId: string;
  type: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}): AuthTokenRecord {
  return {
    id: record.id,
    userId: record.userId,
    type: record.type as AuthTokenType,
    tokenHash: record.tokenHash,
    expiresAt: record.expiresAt.toISOString(),
    usedAt: record.usedAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

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
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED";
  version: number;
  definition: unknown;
  activatedAt: Date | null;
  boundMediaId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AutomationRecord {
  return {
    ...record,
    definition: record.definition as AutomationRecord["definition"],
    activatedAt: record.activatedAt?.toISOString(),
    boundMediaId: record.boundMediaId ?? undefined,
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
    fields: (record as unknown as { fields?: Record<string, string> | null }).fields ?? undefined,
    awaitingFields: (record as unknown as { awaitingFields?: { id: string; question: string }[] | null }).awaitingFields ?? undefined,
    suppressedAt: record.suppressedAt?.toISOString(),
    lastSeenAt: record.lastSeenAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
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
// these fields — and only when the caller explicitly included the key (clearing intent) rather
// than omitted it (leave-untouched intent) — so both repositories share the same clear semantics.
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

    async createUser(input) {
      const email = input.email.toLowerCase();
      try {
        const record = await client.user.create({
          data: { id: createId("user"), email, passwordHash: input.passwordHash },
        });
        return { created: true, record: mapUser(record) };
      } catch (error) {
        // P2002 = unique constraint violation on email.
        if ((error as { code?: string }).code === "P2002") {
          const existing = await client.user.findUnique({ where: { email } });
          if (!existing) throw error;
          return { created: false, record: mapUser(existing) };
        }
        throw error;
      }
    },

    async findUserByEmail(email) {
      const record = await client.user.findUnique({ where: { email: email.toLowerCase() } });
      return record ? mapUser(record) : null;
    },

    async findUserById(id) {
      const record = await client.user.findUnique({ where: { id } });
      return record ? mapUser(record) : null;
    },

    async updateUserPassword(userId, passwordHash) {
      await client.user.update({ where: { id: userId }, data: { passwordHash } });
    },

    async markUserEmailVerified(userId) {
      await client.user.updateMany({
        where: { id: userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      });
    },

    async getUserTokenVersion(userId) {
      const record = await client.user.findUnique({ where: { id: userId }, select: { tokenVersion: true } });
      return record?.tokenVersion ?? null;
    },

    async bumpUserTokenVersion(userId) {
      const record = await client.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
        select: { tokenVersion: true },
      });
      return record.tokenVersion;
    },

    async createAuthToken(input) {
      const record = await client.authToken.create({
        data: {
          id: createId("token"),
          userId: input.userId,
          type: input.type,
          tokenHash: input.tokenHash,
          expiresAt: new Date(input.expiresAt),
        },
      });
      return mapAuthToken(record);
    },

    async consumeAuthToken(tokenHash, type, nowIso) {
      // Single-use consumption guarded by the unique hash and the usedAt-null filter.
      const updated = await client.authToken.updateMany({
        where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date(nowIso) } },
        data: { usedAt: new Date(nowIso) },
      });
      if (updated.count !== 1) return null;
      const record = await client.authToken.findUniqueOrThrow({ where: { tokenHash } });
      return mapAuthToken(record);
    },

    async isSessionRevoked(sessionId) {
      const record = await client.revokedSession.findUnique({
        where: { sessionId },
        select: { expiresAt: true },
      });
      if (!record) return false;
      if (record.expiresAt.getTime() <= Date.now()) {
        await client.revokedSession.delete({ where: { sessionId } }).catch(() => undefined);
        return false;
      }
      return true;
    },

    async revokeSession(sessionId, userId, expiresAt) {
      await client.revokedSession.upsert({
        where: { sessionId },
        create: { sessionId, userId, expiresAt: new Date(expiresAt) },
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

    async countParticipantsPerDay(workspaceId, days) {
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - (days - 1));
      const rows = await client.automationParticipant.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        select: { createdAt: true },
      });
      return bucketCountsByDay(rows.map((row) => row.createdAt.toISOString()), days);
    },

    async countExecutionsSentPerDay(workspaceId, days) {
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - (days - 1));
      const rows = await client.automationExecution.findMany({
        where: { workspaceId, status: "SENT", createdAt: { gte: since } },
        select: { createdAt: true },
      });
      return bucketCountsByDay(rows.map((row) => row.createdAt.toISOString()), days);
    },

    async countParticipantsByMedia(workspaceId) {
      // Three filtered group-bys are clearer and more portable than one raw query.
      const [matchedRows, deliveredRows, clickedRows] = await Promise.all([
        client.automationParticipant.groupBy({
          by: ["sourceMediaId"],
          where: { workspaceId },
          _count: { _all: true },
        }),
        client.automationParticipant.groupBy({
          by: ["sourceMediaId"],
          where: { workspaceId, state: "LINK_SENT" },
          _count: { _all: true },
        }).catch(() => [] as { sourceMediaId: string; _count: { _all: number } }[]),
        client.automationParticipant.groupBy({
          by: ["sourceMediaId"],
          where: { workspaceId, NOT: { deliveryClickedAt: null } },
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
      return updated.count === 1;
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
        },
      });
      return mapAutomation(record);
    },

    async updateAutomation(workspaceId, id, patch: UpdateAutomationInput) {
      // Transaction keeps the existence check and the update atomic so a concurrent
      // delete cannot turn the findFirst/update pair into a spurious P2025 failure.
      const record = await client.$transaction(async (transaction) => {
        const existing = await transaction.automation.findFirst({ where: { workspaceId, id } });
        if (!existing) return null;
        return transaction.automation.update({
          where: { id },
          data: { ...patch, ...(patch.definition ? { version: patch.definition.version } : {}) },
        });
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
      const record = await client.instagramConnection.findFirst({
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
        if (workspaceIds.length > 0) {
          await transaction.automationContact.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
          await transaction.automationParticipant.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
          await transaction.automationExecution.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
          await transaction.webhookEvent.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
          await transaction.automation.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
          await transaction.instagramConnection.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
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
      // Workspaces may connect several professional accounts; upsert per
      // (workspaceId, igUserId) and leave sibling connections untouched.
      const record = await client.instagramConnection.upsert({
        where: { workspaceId_igUserId: { workspaceId: input.workspaceId, igUserId: input.igUserId } },
        create: { id: createId("connection"), ...input },
        update: input,
      });
      return mapConnection(record);
    },

    async recordExecution(input: RecordExecutionInput): Promise<RecordExecutionResult> {
      const existing = await client.automationExecution.findFirst({
        where: { workspaceId: input.workspaceId, dedupeKey: input.dedupeKey },
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
        const record = await client.automationExecution.findFirstOrThrow({
          where: { workspaceId: input.workspaceId, dedupeKey: input.dedupeKey },
        });
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
      try {
        await client.automationExecution.create({
          data: {
            id: createId("execution"),
            status: "PROCESSING",
            dispatchStatus: "DISPATCHING",
            ...input,
            dispatchStartedAt: new Date(input.dispatchStartedAt),
            dispatchLeaseExpiresAt: new Date(input.dispatchLeaseExpiresAt),
          },
        });
        return true;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
        throw error;
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

    async listRecentParticipants(workspaceId, limit) {
      const records = await client.automationParticipant.findMany({
        where: { workspaceId },
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
        // Lost a create race with a concurrent webhook delivery for the same sender —
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
          state: "CAPTURED",
          awaitingAutomationId: null,
          awaitingSince: null,
          attempts: 0,
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

    async deleteContactsByWorkspaceIds(workspaceIds) {
      if (workspaceIds.length === 0) return 0;
      const result = await client.automationContact.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      return result.count;
    },

    async deleteAutomation(workspaceId, id) {
      const result = await client.automation.deleteMany({ where: { workspaceId, id } });
      return result.count > 0;
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
          status: input.total > 0 ? "RUNNING" : "COMPLETED",
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

    async getMessagingWindow(workspaceId) {
      const row = await client.workspace.findUnique({
        where: { id: workspaceId },
        select: { quietStartHour: true, quietEndHour: true, timezone: true },
      });
      if (!row?.quietStartHour || row?.quietEndHour === null || row?.quietEndHour === undefined || !row.timezone) return null;
      return { startHour: row.quietStartHour, endHour: row.quietEndHour, timezone: row.timezone };
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
      const records = await client.automationContact.findMany({
        where: {
          workspaceId,
          suppressedAt: null,
          ...(segment === "captured_email" ? { state: "CAPTURED", email: { not: null } } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: limit,
        select: { igScopedUserId: true, instagramAccountId: true },
      });
      return records;
    },
  };
}
