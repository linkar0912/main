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
} from "./repository";

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
    messagingWindowExpiresAt: record.messagingWindowExpiresAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapParticipantPatch(patch: ParticipantPatch) {
  return {
    ...patch,
    publicReplySentAt: patch.publicReplySentAt ? new Date(patch.publicReplySentAt) : undefined,
    openingSentAt: patch.openingSentAt ? new Date(patch.openingSentAt) : undefined,
    followCheckedAt: patch.followCheckedAt ? new Date(patch.followCheckedAt) : undefined,
    finalDeliveredAt: patch.finalDeliveredAt ? new Date(patch.finalDeliveredAt) : undefined,
    messagingWindowExpiresAt: patch.messagingWindowExpiresAt ? new Date(patch.messagingWindowExpiresAt) : undefined,
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

export function createPrismaRepository(client = prisma): AutomationRepository {
  return {
    async ensureWorkspace(workspaceId, ownerEmail) {
      await client.workspace.upsert({
        where: { id: workspaceId },
        create: {
          id: workspaceId,
          name: "ReplyConnect workspace",
          slug: `replyconnect-${workspaceId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}`,
          members: { create: { id: createId("member"), email: ownerEmail, role: "OWNER" } },
        },
        update: {},
      });
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
      const existing = await client.automation.findFirst({ where: { workspaceId, id } });
      if (!existing) return null;
      const record = await client.automation.update({
        where: { id },
        data: { ...patch, ...(patch.definition ? { version: patch.definition.version } : {}) },
      });
      return mapAutomation(record);
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
      await client.instagramConnection.deleteMany({
        where: { workspaceId: input.workspaceId, NOT: { igUserId: input.igUserId } },
      });
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
            sourceMediaSnapshot: input.sourceMediaSnapshot as Prisma.InputJsonValue,
            ...mapParticipantPatch(input),
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
  };
}
