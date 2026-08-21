import { createId } from "./id";
import type {
  AutomationRecord,
  AutomationParticipantRecord,
  AutomationRepository,
  CreateAutomationInput,
  CreateParticipantInput,
  ExecutionRecord,
  InstagramConnectionRecord,
  RecordExecutionInput,
  RecordExecutionResult,
  UpdateAutomationInput,
  DataDeletionRequestRecord,
  ParticipantPatch,
  ParticipantState,
} from "./repository";

function now(): string {
  return new Date().toISOString();
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

export function createMemoryRepository(seed: AutomationRecord[] = []): AutomationRepository {
  const automations = new Map(seed.map((automation) => [automation.id, copy(automation)]));
  const connections = new Map<string, InstagramConnectionRecord>();
  const executions = new Map<string, ExecutionRecord>();
  const deletionRequests = new Map<string, DataDeletionRequestRecord>();
  const participants = new Map<string, AutomationParticipantRecord>();
  const participantIdsBySource = new Map<string, string>();

  return {
    async ensureWorkspace() {},

    async listAutomations(workspaceId) {
      return copy(
        [...automations.values()]
          .filter((automation) => automation.workspaceId === workspaceId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)),
      );
    },

    async getAutomation(workspaceId, id) {
      const automation = automations.get(id);
      return automation?.workspaceId === workspaceId ? copy(automation) : null;
    },

    async createAutomation(workspaceId, input: CreateAutomationInput) {
      const timestamp = now();
      const automation: AutomationRecord = {
        id: createId("automation"),
        workspaceId,
        name: input.name.trim(),
        status: "DRAFT",
        version: input.definition.version,
        definition: copy(input.definition),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      automations.set(automation.id, automation);
      return copy(automation);
    },

    async updateAutomation(workspaceId, id, patch: UpdateAutomationInput) {
      const current = automations.get(id);
      if (!current || current.workspaceId !== workspaceId) return null;
      const { boundMediaId, ...rest } = patch;
      const updated: AutomationRecord = {
        ...current,
        ...rest,
        ...(boundMediaId === undefined ? {} : { boundMediaId: boundMediaId ?? undefined }),
        name: patch.name?.trim() || current.name,
        definition: patch.definition ? copy(patch.definition) : current.definition,
        version: patch.definition?.version ?? current.version,
        updatedAt: now(),
      };
      automations.set(id, updated);
      return copy(updated);
    },

    async listConnections(workspaceId) {
      return copy([...connections.values()].filter((connection) => connection.workspaceId === workspaceId));
    },

    async listConnectionsExpiringBefore(before) {
      return copy([...connections.values()].filter((connection) =>
        connection.status === "CONNECTED" && connection.tokenExpiresAt && connection.tokenExpiresAt <= before,
      ));
    },

    async updateConnectionToken(id, accessTokenEncrypted, tokenExpiresAt) {
      const connection = connections.get(id);
      if (!connection) return;
      connections.set(id, { ...connection, accessTokenEncrypted, tokenExpiresAt });
    },

    async updateConnectionStatus(id, status) {
      const connection = connections.get(id);
      if (connection) connections.set(id, { ...connection, status });
    },

    async findWorkspaceByInstagramAccount(igUserId) {
      const connection = [...connections.values()].find(
        (candidate) => candidate.igUserId === igUserId && candidate.status === "CONNECTED",
      );
      return connection ? { workspaceId: connection.workspaceId, connection: copy(connection) } : null;
    },

    async deleteConnectionByInstagramAccount(igUserId) {
      for (const [id, connection] of connections.entries()) {
        if (connection.igUserId === igUserId) connections.delete(id);
      }
    },

    async deleteConnection(workspaceId, id) {
      const connection = connections.get(id);
      if (!connection || connection.workspaceId !== workspaceId) return false;
      connections.delete(id);
      return true;
    },

    async beginInstagramDataDeletion(igUserId, confirmationCode, signedRequestHash) {
      const workspaceIds = new Set(
        [...connections.values()].filter((connection) => connection.igUserId === igUserId).map((connection) => connection.workspaceId),
      );
      for (const [id, participant] of participants.entries()) {
        if (!workspaceIds.has(participant.workspaceId)) continue;
        participants.delete(id);
        participantIdsBySource.delete(`${participant.workspaceId}:${participant.instagramAccountId}:${participant.sourceCommentId}`);
      }
      for (const [id, connection] of connections.entries()) {
        if (connection.igUserId === igUserId) connections.delete(id);
      }
      for (const [id, automation] of automations.entries()) {
        if (workspaceIds.has(automation.workspaceId)) automations.delete(id);
      }
      for (const [id, execution] of executions.entries()) {
        if (workspaceIds.has(execution.workspaceId)) executions.delete(id);
      }
      const timestamp = now();
      const record: DataDeletionRequestRecord = {
        confirmationCode,
        signedRequestHash,
        status: "PENDING",
        requestedAt: timestamp,
      };
      deletionRequests.set(confirmationCode, record);
      return copy(record);
    },

    async completeDataDeletion(confirmationCode) {
      const current = deletionRequests.get(confirmationCode);
      if (!current) throw new Error("Deletion request not found");
      const record: DataDeletionRequestRecord = { ...current, status: "COMPLETED", completedAt: now() };
      deletionRequests.set(confirmationCode, record);
      return copy(record);
    },

    async findDataDeletionByRequestHash(signedRequestHash) {
      const record = [...deletionRequests.values()].find((candidate) => candidate.signedRequestHash === signedRequestHash);
      return record ? copy(record) : null;
    },

    async getDataDeletionRequest(confirmationCode) {
      const record = deletionRequests.get(confirmationCode);
      return record ? copy(record) : null;
    },

    async upsertConnection(input) {
      for (const [id, connection] of connections.entries()) {
        if (connection.workspaceId === input.workspaceId && connection.igUserId !== input.igUserId) connections.delete(id);
      }
      const existing = [...connections.values()].find(
        (connection) => connection.workspaceId === input.workspaceId && connection.igUserId === input.igUserId,
      );
      const connection: InstagramConnectionRecord = {
        id: existing?.id ?? createId("connection"),
        ...input,
        connectedAt: existing?.connectedAt ?? now(),
      };
      connections.set(connection.id, connection);
      return copy(connection);
    },

    async recordExecution(input: RecordExecutionInput): Promise<RecordExecutionResult> {
      const existing = [...executions.values()].find(
        (record) => record.workspaceId === input.workspaceId && record.dedupeKey === input.dedupeKey,
      );
      if (existing) return { created: false, record: copy(existing) };
      const record: ExecutionRecord = {
        id: createId("execution"),
        createdAt: now(),
        ...input,
        dispatchStatus: input.dispatchStatus ?? "CLAIMED",
      };
      executions.set(record.id, record);
      return { created: true, record: copy(record) };
    },

    async claimExecution(input) {
      const existing = [...executions.values()].some(
        (record) => record.workspaceId === input.workspaceId && record.dedupeKey === input.dedupeKey,
      );
      if (existing) return false;
      const record: ExecutionRecord = {
        id: createId("execution"),
        createdAt: now(),
        status: "PROCESSING",
        dispatchStatus: "CLAIMED",
        ...input,
      };
      executions.set(record.id, record);
      return true;
    },

    async claimExecutionDispatch(input) {
      const existing = [...executions.values()].some(
        (record) =>
          (record.workspaceId === input.workspaceId && record.dedupeKey === input.dedupeKey)
          || record.dispatchOwner === input.dispatchOwner,
      );
      if (existing) return false;
      const record: ExecutionRecord = {
        id: createId("execution"),
        createdAt: now(),
        status: "PROCESSING",
        dispatchStatus: "DISPATCHING",
        ...input,
      };
      executions.set(record.id, record);
      return true;
    },

    async getExecution(workspaceId, dedupeKey) {
      const record = [...executions.values()].find(
        (candidate) => candidate.workspaceId === workspaceId && candidate.dedupeKey === dedupeKey,
      );
      return record ? copy(record) : null;
    },

    async completeExecution(workspaceId, dedupeKey, result) {
      const entry = [...executions.entries()].find(([, record]) =>
        record.workspaceId === workspaceId && record.dedupeKey === dedupeKey && record.status === "PROCESSING",
      );
      if (!entry) return;
      executions.set(entry[0], { ...entry[1], ...result });
    },

    async completeOwnedExecution(workspaceId, dedupeKey, dispatchOwner, result) {
      const entry = [...executions.entries()].find(([, record]) =>
        record.workspaceId === workspaceId
        && record.dedupeKey === dedupeKey
        && record.status === "PROCESSING"
        && record.dispatchStatus === "DISPATCHING"
        && record.dispatchOwner === dispatchOwner,
      );
      if (!entry) return false;
      executions.set(entry[0], { ...entry[1], ...result });
      return true;
    },

    async failAbandonedExecution(workspaceId, dedupeKey, observedAt, reason) {
      const observedAtMs = Date.parse(observedAt);
      if (!Number.isFinite(observedAtMs)) throw new Error("observedAt must be a valid timestamp");
      const entry = [...executions.entries()].find(([, record]) => {
        if (
          record.workspaceId !== workspaceId
          || record.dedupeKey !== dedupeKey
          || record.status !== "PROCESSING"
          || record.dispatchStatus !== "DISPATCHING"
        ) return false;
        const startedAtMs = record.dispatchStartedAt ? Date.parse(record.dispatchStartedAt) : Number.NaN;
        const leaseExpiresAtMs = record.dispatchLeaseExpiresAt
          ? Date.parse(record.dispatchLeaseExpiresAt)
          : Number.NaN;
        return !record.dispatchOwner
          || !Number.isFinite(startedAtMs)
          || !Number.isFinite(leaseExpiresAtMs)
          || leaseExpiresAtMs <= observedAtMs;
      });
      if (!entry) return false;
      executions.set(entry[0], { ...entry[1], status: "FAILED", reason });
      return true;
    },

    async releaseExecutionClaim(workspaceId, dedupeKey) {
      const entry = [...executions.entries()].find(([, record]) =>
        record.workspaceId === workspaceId && record.dedupeKey === dedupeKey && record.status === "PROCESSING",
      );
      if (entry) executions.delete(entry[0]);
    },

    async releaseOwnedExecutionClaim(workspaceId, dedupeKey, dispatchOwner) {
      const entry = [...executions.entries()].find(([, record]) =>
        record.workspaceId === workspaceId
        && record.dedupeKey === dedupeKey
        && record.status === "PROCESSING"
        && record.dispatchStatus === "DISPATCHING"
        && record.dispatchOwner === dispatchOwner,
      );
      if (!entry) return false;
      executions.delete(entry[0]);
      return true;
    },

    async hasExecution(workspaceId, dedupeKey) {
      return [...executions.values()].some(
        (record) => record.workspaceId === workspaceId && record.dedupeKey === dedupeKey,
      );
    },

    async createParticipant(input: CreateParticipantInput) {
      const sourceKey = `${input.workspaceId}:${input.instagramAccountId}:${input.sourceCommentId}`;
      const existingId = participantIdsBySource.get(sourceKey);
      if (existingId) {
        const existing = participants.get(existingId);
        if (existing) return { created: false, record: copy(existing) };
      }
      const timestamp = now();
      const record: AutomationParticipantRecord = {
        ...input,
        id: createId("participant"),
        sourceMediaSnapshot: copy(input.sourceMediaSnapshot),
        state: input.state ?? "COMMENT_MATCHED",
        publicReplyStatus: input.publicReplyStatus ?? "PENDING",
        openingStatus: input.openingStatus ?? "PENDING",
        finalDeliveryStatus: input.finalDeliveryStatus ?? "PENDING",
        recheckCount: input.recheckCount ?? 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      participants.set(record.id, record);
      participantIdsBySource.set(sourceKey, record.id);
      return { created: true, record: copy(record) };
    },

    async getParticipant(workspaceId, instagramAccountId, id) {
      const record = participants.get(id);
      return record?.workspaceId === workspaceId && record.instagramAccountId === instagramAccountId
        ? copy(record)
        : null;
    },

    async findParticipantBySource(workspaceId, instagramAccountId, sourceCommentId) {
      const id = participantIdsBySource.get(`${workspaceId}:${instagramAccountId}:${sourceCommentId}`);
      const record = id ? participants.get(id) : undefined;
      return record ? copy(record) : null;
    },

    async findPendingParticipant(instagramAccountId, igScopedUserId) {
      const record = [...participants.values()]
        .filter((participant) =>
          participant.instagramAccountId === instagramAccountId
          && participant.igScopedUserId === igScopedUserId
          && !["LINK_SENT", "EXPIRED", "FAILED"].includes(participant.state),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      return record ? copy(record) : null;
    },

    async transitionParticipant(id, expectedStates: ParticipantState[], patch: ParticipantPatch) {
      const current = participants.get(id);
      if (!current || !expectedStates.includes(current.state)) return null;
      const updated: AutomationParticipantRecord = { ...current, ...patch, updatedAt: now() };
      participants.set(id, updated);
      return copy(updated);
    },

    async bindNextMedia(workspaceId, automationId, mediaId, publishedAt) {
      const current = automations.get(automationId);
      if (
        !current
        || current.workspaceId !== workspaceId
        || current.status !== "ACTIVE"
        || current.boundMediaId
        || !current.activatedAt
        || publishedAt <= current.activatedAt
      ) return false;
      automations.set(automationId, { ...current, boundMediaId: mediaId, updatedAt: now() });
      return true;
    },

    async listParticipants(workspaceId, automationId, limit) {
      return copy(
        [...participants.values()]
          .filter((participant) => participant.workspaceId === workspaceId && participant.automationId === automationId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, limit),
      );
    },

    async expireParticipantsByInstagramAccount(instagramAccountId, reason) {
      let count = 0;
      for (const [id, participant] of participants.entries()) {
        if (participant.instagramAccountId !== instagramAccountId || ["LINK_SENT", "EXPIRED", "FAILED"].includes(participant.state)) continue;
        participants.set(id, { ...participant, state: "EXPIRED", finalDeliveryError: reason, updatedAt: now() });
        count += 1;
      }
      return count;
    },

    async deleteParticipantsByWorkspaceIds(workspaceIds) {
      const workspaceIdSet = new Set(workspaceIds);
      let count = 0;
      for (const [id, participant] of participants.entries()) {
        if (!workspaceIdSet.has(participant.workspaceId)) continue;
        participants.delete(id);
        participantIdsBySource.delete(`${participant.workspaceId}:${participant.instagramAccountId}:${participant.sourceCommentId}`);
        count += 1;
      }
      return count;
    },
  };
}
