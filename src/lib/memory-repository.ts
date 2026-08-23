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
  CreateUserInput,
  UserRecord,
  AuthTokenType,
  AuthTokenRecord,
  MemberRole,
  MemberRecord,
  InvitationRecord,
  CreateInvitationInput,
  AutomationContactRecord,
  CapturedContactSummary,
  TouchContactResult,
  AutomationSequenceRecord,
  SequenceStep,
  SequenceStatus,
  SequenceEnrollmentRecord,
  EnrollmentState,
  SequenceEnrollmentCount,
  DueSequenceSend,
  BroadcastRecord,
  BroadcastSegment,
  MessagingWindow,
  EnsureOutboundDeliveryInput,
  OutboundDeliveryRecord,
} from "./repository";
import { InstagramAccountOwnershipError } from "./repository";
import type { EmailCaptureField } from "./automation/types";

function now(): string {
  return new Date().toISOString();
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

function copy<T>(value: T): T {
  return structuredClone(value);
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

export function createMemoryRepository(seed: AutomationRecord[] = []): AutomationRepository {
  const automations = new Map(seed.map((automation) => [automation.id, copy(automation)]));
  const connections = new Map<string, InstagramConnectionRecord>();
  const executions = new Map<string, ExecutionRecord>();
  const outboundDeliveries = new Map<string, OutboundDeliveryRecord>();
  const automationDailySendCounters = new Map<string, number>();
  const deletionRequests = new Map<string, DataDeletionRequestRecord>();
  const participants = new Map<string, AutomationParticipantRecord>();
  const participantIdsBySource = new Map<string, string>();
  const contacts = new Map<string, AutomationContactRecord>();
  const contactIdsBySender = new Map<string, string>();
  const sequences = new Map<string, AutomationSequenceRecord>();
  const enrollments = new Map<string, SequenceEnrollmentRecord>();
  const enrollmentIdsByPair = new Map<string, string>();
  const broadcasts = new Map<string, BroadcastRecord>();
  const messagingWindows = new Map<string, MessagingWindow>();
  const usersByEmail = new Map<string, UserRecord>();
  const usersById = new Map<string, UserRecord>();
  // email -> workspaceId, mirroring WorkspaceMember rows for login lookups.
  const memberWorkspacesByEmail = new Map<string, string>();
  const membersByEmail = new Map<string, MemberRecord>();
  const authTokensByHash = new Map<string, AuthTokenRecord>();
  const revokedSessions = new Map<string, { userId: string; expiresAt: string }>();
  const invitationsById = new Map<string, InvitationRecord>();

  return {
    async ensureWorkspace(workspaceId, ownerEmail) {
      if (!ownerEmail) return;
      const email = ownerEmail.toLowerCase();
      memberWorkspacesByEmail.set(email, workspaceId);
      const key = `${workspaceId}:${email}`;
      if (!membersByEmail.has(key)) {
        membersByEmail.set(key, {
          id: createId("member"),
          workspaceId,
          email,
          role: "OWNER",
        });
      }
    },

    async createUser(input: CreateUserInput) {
      const email = input.email.toLowerCase();
      const existing = usersByEmail.get(email);
      if (existing) return { created: false, record: copy(existing) };
      const record: UserRecord = {
        id: createId("user"),
        email,
        passwordHash: input.passwordHash,
        tokenVersion: 0,
        createdAt: now(),
      };
      usersByEmail.set(email, record);
      usersById.set(record.id, record);
      return { created: true, record: copy(record) };
    },

    async findUserByEmail(email) {
      const record = usersByEmail.get(email.toLowerCase());
      return record ? copy(record) : null;
    },

    async findUserById(id) {
      const record = usersById.get(id);
      return record ? copy(record) : null;
    },

    async updateUserPassword(userId, passwordHash) {
      const record = usersById.get(userId);
      if (record) usersById.set(userId, { ...record, passwordHash });
    },

    async markUserEmailVerified(userId) {
      const record = usersById.get(userId);
      if (record && !record.emailVerifiedAt) usersById.set(userId, { ...record, emailVerifiedAt: now() });
    },

    async getUserTokenVersion(userId) {
      return usersById.get(userId)?.tokenVersion ?? null;
    },

    async bumpUserTokenVersion(userId) {
      const record = usersById.get(userId);
      if (!record) throw new Error("User not found");
      const tokenVersion = record.tokenVersion + 1;
      usersById.set(userId, { ...record, tokenVersion });
      return tokenVersion;
    },

    async createAuthToken(input) {
      const record: AuthTokenRecord = { id: createId("token"), createdAt: now(), ...input };
      authTokensByHash.set(record.tokenHash, record);
      return copy(record);
    },

    async consumeAuthToken(tokenHash, type, nowIso) {
      const record = authTokensByHash.get(tokenHash);
      if (!record || record.type !== type || record.usedAt || record.expiresAt <= nowIso) return null;
      const consumed: AuthTokenRecord = { ...record, usedAt: nowIso };
      authTokensByHash.set(tokenHash, consumed);
      return copy(consumed);
    },

    async isSessionRevoked(sessionId) {
      const entry = revokedSessions.get(sessionId);
      if (!entry) return false;
      if (entry.expiresAt <= now()) {
        revokedSessions.delete(sessionId);
        return false;
      }
      return true;
    },

    async revokeSession(sessionId, userId, expiresAt) {
      revokedSessions.set(sessionId, { userId, expiresAt });
    },

    async listMembers(workspaceId) {
      return copy([...membersByEmail.values()].filter((member) => member.workspaceId === workspaceId));
    },

    async getMemberRole(workspaceId, email) {
      return membersByEmail.get(`${workspaceId}:${email.toLowerCase()}`)?.role ?? null;
    },

    async addMember(workspaceId, email, role: MemberRole) {
      const key = `${workspaceId}:${email.toLowerCase()}`;
      if (membersByEmail.has(key)) return { created: false };
      membersByEmail.set(key, { id: createId("member"), workspaceId, email: email.toLowerCase(), role });
      memberWorkspacesByEmail.set(email.toLowerCase(), workspaceId);
      return { created: true };
    },

    async updateMemberRole(workspaceId, email, role: MemberRole) {
      const key = `${workspaceId}:${email.toLowerCase()}`;
      const member = membersByEmail.get(key);
      if (!member) return false;
      membersByEmail.set(key, { ...member, role });
      return true;
    },

    async removeMember(workspaceId, email) {
      const key = `${workspaceId}:${email.toLowerCase()}`;
      const member = membersByEmail.get(key);
      if (!member || member.role === "OWNER") return false;
      membersByEmail.delete(key);
      return true;
    },

    async createInvitation(input: CreateInvitationInput) {
      const record: InvitationRecord = { id: createId("invitation"), createdAt: now(), ...input };
      invitationsById.set(record.id, record);
      return copy(record);
    },

    async listInvitations(workspaceId) {
      return copy([...invitationsById.values()].filter((invitation) => invitation.workspaceId === workspaceId));
    },

    async findInvitationByTokenHash(tokenHash) {
      const record = [...invitationsById.values()].find((invitation) => invitation.tokenHash === tokenHash);
      return record ? copy(record) : null;
    },

    async acceptInvitation(id, nowIso) {
      const record = invitationsById.get(id);
      if (!record || record.acceptedAt || record.revokedAt || record.expiresAt <= nowIso) return null;
      const accepted: InvitationRecord = { ...record, acceptedAt: nowIso };
      invitationsById.set(id, accepted);
      await this.addMember(record.workspaceId, record.email, record.role);
      return copy(accepted);
    },

    async revokeInvitation(workspaceId, id) {
      const record = invitationsById.get(id);
      if (!record || record.workspaceId !== workspaceId || record.acceptedAt) return false;
      invitationsById.set(id, { ...record, revokedAt: now() });
      return true;
    },

    async countParticipantsByState(workspaceId, automationId) {
      const counts: Record<string, number> = {};
      for (const participant of participants.values()) {
        if (participant.workspaceId !== workspaceId) continue;
        if (automationId && participant.automationId !== automationId) continue;
        counts[participant.state] = (counts[participant.state] ?? 0) + 1;
      }
      return counts;
    },

    async countExecutionsSentSince(automationId, sinceIso) {
      return [...executions.values()].filter(
        (execution) => execution.automationId === automationId && execution.status === "SENT" && execution.createdAt >= sinceIso,
      ).length;
    },

    async countParticipantsCreatedSince(workspaceId, sinceIso) {
      return [...participants.values()].filter(
        (participant) => participant.workspaceId === workspaceId && participant.createdAt >= sinceIso,
      ).length;
    },

    async countParticipantsPerDay(workspaceId, days, automationId) {
      const timestamps = [...participants.values()]
        .filter((participant) => participant.workspaceId === workspaceId && (!automationId || participant.automationId === automationId))
        .map((participant) => participant.createdAt);
      return bucketCountsByDay(timestamps, days);
    },

    async countExecutionsSentPerDay(workspaceId, days, automationId) {
      const timestamps = [...executions.values()]
        .filter((execution) => execution.workspaceId === workspaceId && execution.status === "SENT" && (!automationId || execution.automationId === automationId))
        .map((execution) => execution.createdAt);
      return bucketCountsByDay(timestamps, days);
    },

    async countParticipantsByMedia(workspaceId, automationId) {
      const byMedia = new Map<string, { matched: number; delivered: number; clicked: number }>();
      for (const participant of participants.values()) {
        if (participant.workspaceId !== workspaceId || (automationId && participant.automationId !== automationId)) continue;
        const entry = byMedia.get(participant.sourceMediaId) ?? { matched: 0, delivered: 0, clicked: 0 };
        entry.matched += 1;
        if (participant.state === "LINK_SENT") entry.delivered += 1;
        if (participant.deliveryClickedAt) entry.clicked += 1;
        byMedia.set(participant.sourceMediaId, entry);
      }
      return [...byMedia.entries()].map(([mediaId, counts]) => ({ mediaId, ...counts }));
    },

    async countParticipantFunnel(workspaceId, automationId) {
      const result = { commented: 0, openingSent: 0, optedIn: 0, followed: 0, linkSent: 0 };
      const optedInStates = new Set(["OPTED_IN", "FOLLOW_REQUIRED", "FOLLOW_VERIFIED", "LINK_SENT"]);
      const followedStates = new Set(["FOLLOW_VERIFIED", "LINK_SENT"]);
      for (const participant of participants.values()) {
        if (participant.workspaceId !== workspaceId || participant.automationId !== automationId) continue;
        result.commented += 1;
        if (participant.openingStatus === "SENT") result.openingSent += 1;
        if (optedInStates.has(participant.state)) result.optedIn += 1;
        if (participant.followStatus === true || followedStates.has(participant.state)) result.followed += 1;
        if (participant.finalDeliveryStatus === "SENT") result.linkSent += 1;
      }
      return result;
    },

    async getParticipantById(id) {
      const record = participants.get(id);
      return record ? copy(record) : null;
    },

    async markDeliveryClicked(id, atIso) {
      const record = participants.get(id);
      if (!record || record.deliveryClickedAt) return false;
      participants.set(id, { ...record, deliveryClickedAt: atIso, updatedAt: now() });
      return true;
    },

    async findWorkspaceIdByMemberEmail(email) {
      return memberWorkspacesByEmail.get(email.toLowerCase()) ?? null;
    },

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
        if (participant.instagramAccountId !== igUserId) continue;
        participants.delete(id);
        participantIdsBySource.delete(`${participant.workspaceId}:${participant.instagramAccountId}:${participant.sourceCommentId}`);
      }
      const deletedContactIds = new Set<string>();
      for (const [id, contact] of contacts.entries()) {
        if (contact.instagramAccountId !== igUserId) continue;
        contacts.delete(id);
        deletedContactIds.add(id);
        contactIdsBySender.delete(`${contact.workspaceId}:${contact.instagramAccountId}:${contact.igScopedUserId}`);
      }
      for (const [id, enrollment] of enrollments.entries()) {
        if (!deletedContactIds.has(enrollment.contactId)) continue;
        enrollments.delete(id);
        enrollmentIdsByPair.delete(`${enrollment.sequenceId}:${enrollment.contactId}`);
      }
      for (const [id, connection] of connections.entries()) {
        if (connection.igUserId === igUserId) connections.delete(id);
      }
      for (const workspaceId of workspaceIds) {
        const hasSiblingConnection = [...connections.values()].some((connection) => connection.workspaceId === workspaceId);
        if (hasSiblingConnection) continue;
        await this.deleteParticipantsByWorkspaceIds([workspaceId]);
        const workspaceContactIds = new Set<string>();
        for (const [id, contact] of contacts.entries()) {
          if (contact.workspaceId !== workspaceId) continue;
          contacts.delete(id);
          workspaceContactIds.add(id);
          contactIdsBySender.delete(`${contact.workspaceId}:${contact.instagramAccountId}:${contact.igScopedUserId}`);
        }
        for (const [id, enrollment] of enrollments.entries()) {
          if (enrollment.workspaceId !== workspaceId && !workspaceContactIds.has(enrollment.contactId)) continue;
          enrollments.delete(id);
          enrollmentIdsByPair.delete(`${enrollment.sequenceId}:${enrollment.contactId}`);
        }
        for (const [id, sequence] of sequences.entries()) if (sequence.workspaceId === workspaceId) sequences.delete(id);
        for (const [id, broadcast] of broadcasts.entries()) if (broadcast.workspaceId === workspaceId) broadcasts.delete(id);
        for (const [id, automation] of automations.entries()) if (automation.workspaceId === workspaceId) automations.delete(id);
        for (const [id, execution] of executions.entries()) if (execution.workspaceId === workspaceId) executions.delete(id);
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
      // Several professional accounts may live in one workspace; keep siblings.
      const existing = [...connections.values()].find((connection) => connection.igUserId === input.igUserId);
      if (existing && existing.workspaceId !== input.workspaceId) throw new InstagramAccountOwnershipError();
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

    async ensureOutboundDelivery(input: EnsureOutboundDeliveryInput) {
      const existing = outboundDeliveries.get(input.deliveryKey);
      if (existing) return copy(existing);
      const timestamp = now();
      const record: OutboundDeliveryRecord = {
        ...copy(input),
        id: createId("delivery"),
        state: "PENDING",
        retryable: false,
        attemptCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      outboundDeliveries.set(record.deliveryKey, record);
      return copy(record);
    },

    async getOutboundDelivery(deliveryKey) {
      const record = outboundDeliveries.get(deliveryKey);
      return record ? copy(record) : null;
    },

    async claimOutboundDelivery(deliveryKey, owner, leaseUntil) {
      const record = outboundDeliveries.get(deliveryKey);
      if (!record) throw new Error("Outbound delivery not found");
      if (record.state !== "PENDING" && !(record.state === "FAILED" && record.retryable)) {
        return { claimed: false, record: copy(record) };
      }
      const claimed: OutboundDeliveryRecord = {
        ...record,
        state: "CLAIMED",
        retryable: false,
        resultCode: undefined,
        claimOwner: owner,
        claimExpiresAt: leaseUntil,
        attemptCount: record.attemptCount + 1,
        lastError: undefined,
        updatedAt: now(),
      };
      outboundDeliveries.set(deliveryKey, claimed);
      return { claimed: true, record: copy(claimed) };
    },

    async completeOutboundDelivery(deliveryKey, owner, providerMessageId, sentAt) {
      const record = outboundDeliveries.get(deliveryKey);
      if (record?.state !== "CLAIMED" || record.claimOwner !== owner) return false;
      outboundDeliveries.set(deliveryKey, {
        ...record,
        state: "SENT",
        retryable: false,
        resultCode: "DELIVERED",
        claimOwner: undefined,
        claimExpiresAt: undefined,
        providerMessageId,
        lastError: undefined,
        sentAt,
        updatedAt: now(),
      });
      return true;
    },

    async failOutboundDelivery(deliveryKey, owner, error, retryable, resultCode) {
      const record = outboundDeliveries.get(deliveryKey);
      if (record?.state !== "CLAIMED" || record.claimOwner !== owner) return false;
      outboundDeliveries.set(deliveryKey, {
        ...record,
        state: "FAILED",
        retryable,
        resultCode,
        claimOwner: undefined,
        claimExpiresAt: undefined,
        lastError: error,
        updatedAt: now(),
      });
      return true;
    },

    async markOutboundDeliveryUnknown(deliveryKey, owner, error) {
      const record = outboundDeliveries.get(deliveryKey);
      if (record?.state !== "CLAIMED" || (owner !== undefined && record.claimOwner !== owner)) {
        return false;
      }
      outboundDeliveries.set(deliveryKey, {
        ...record,
        state: "UNKNOWN",
        retryable: false,
        resultCode: "AMBIGUOUS",
        claimOwner: undefined,
        claimExpiresAt: undefined,
        lastError: error,
        updatedAt: now(),
      });
      return true;
    },

    async listExpiredDeliveryClaims(nowIso, limit) {
      return copy([...outboundDeliveries.values()]
        .filter((record) =>
          record.state === "CLAIMED"
          && record.claimExpiresAt !== undefined
          && record.claimExpiresAt <= nowIso)
        .sort((left, right) =>
          (left.claimExpiresAt ?? "").localeCompare(right.claimExpiresAt ?? ""))
        .slice(0, Math.max(0, limit)));
    },

    async claimAutomationSendSlots(automationId, utcDate, amount, limit) {
      validateQuotaRequest(utcDate, amount, limit);
      const key = `${automationId}:${utcDate}`;
      const reserved = automationDailySendCounters.get(key) ?? 0;
      if (reserved + amount > limit) return false;
      automationDailySendCounters.set(key, reserved + amount);
      return true;
    },

    async releaseAutomationSendSlots(automationId, utcDate, amount) {
      validatePositiveInteger(amount, "amount");
      validateUtcDate(utcDate);
      const key = `${automationId}:${utcDate}`;
      const reserved = automationDailySendCounters.get(key) ?? 0;
      automationDailySendCounters.set(key, Math.max(0, reserved - amount));
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

    async listRecentParticipants(workspaceId, limit, automationId) {
      return copy(
        [...participants.values()]
          .filter((participant) => participant.workspaceId === workspaceId && (!automationId || participant.automationId === automationId))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
          .slice(0, limit),
      );
    },

    async countExecutionsByStatusPerAutomation(workspaceId, sinceIso) {
      const sinceMs = Date.parse(sinceIso);
      const tallies = new Map<string, { sent: number; failed: number; skipped: number }>();
      for (const execution of executions.values()) {
        if (execution.workspaceId !== workspaceId || Date.parse(execution.createdAt) < sinceMs) continue;
        if (!(["SENT", "FAILED", "SKIPPED"] as const).includes(execution.status as "SENT" | "FAILED" | "SKIPPED")) continue;
        const tally = tallies.get(execution.automationId) ?? { sent: 0, failed: 0, skipped: 0 };
        if (execution.status === "SENT") tally.sent += 1;
        else if (execution.status === "FAILED") tally.failed += 1;
        else tally.skipped += 1;
        tallies.set(execution.automationId, tally);
      }
      return [...tallies.entries()].map(([automationId, t]) => ({ automationId, ...t }));
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

    async expireStaleParticipants(nowIso, reason) {
      const nowMs = Date.parse(nowIso);
      let count = 0;
      for (const [id, participant] of participants.entries()) {
        if (["LINK_SENT", "EXPIRED", "FAILED"].includes(participant.state)) continue;
        const expiresAt = participant.messagingWindowExpiresAt ? Date.parse(participant.messagingWindowExpiresAt) : Number.NaN;
        if (!Number.isFinite(expiresAt) || expiresAt > nowMs) continue;
        participants.set(id, { ...participant, state: "EXPIRED", finalDeliveryError: reason, updatedAt: now() });
        count += 1;
      }
      return count;
    },

    async deleteStaleTerminalParticipants(beforeIso) {
      const beforeMs = Date.parse(beforeIso);
      let count = 0;
      for (const [id, participant] of participants.entries()) {
        if (!["LINK_SENT", "EXPIRED", "FAILED"].includes(participant.state)) continue;
        if (Date.parse(participant.updatedAt) >= beforeMs) continue;
        participants.delete(id);
        participantIdsBySource.delete(`${participant.workspaceId}:${participant.instagramAccountId}:${participant.sourceCommentId}`);
        count += 1;
      }
      return count;
    },

    async touchContact(workspaceId, instagramAccountId, igScopedUserId, seenAt): Promise<TouchContactResult> {
      const senderKey = `${workspaceId}:${instagramAccountId}:${igScopedUserId}`;
      const existingId = contactIdsBySender.get(senderKey);
      if (existingId) {
        const existing = contacts.get(existingId);
        if (existing) {
          const updated: AutomationContactRecord = { ...existing, lastSeenAt: seenAt, updatedAt: now() };
          contacts.set(existingId, updated);
          return { created: false, record: copy(updated) };
        }
      }
      const timestamp = now();
      const record: AutomationContactRecord = {
        id: createId("contact"),
        workspaceId,
        instagramAccountId,
        igScopedUserId,
        state: "NONE",
        attempts: 0,
        lastSeenAt: seenAt > timestamp ? seenAt : timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      contacts.set(record.id, record);
      contactIdsBySender.set(senderKey, record.id);
      return { created: true, record: copy(record) };
    },

    async getContact(workspaceId, instagramAccountId, igScopedUserId) {
      const id = contactIdsBySender.get(`${workspaceId}:${instagramAccountId}:${igScopedUserId}`);
      const record = id ? contacts.get(id) : undefined;
      return record ? copy(record) : null;
    },

    async setContactAwaitingEmail(workspaceId, instagramAccountId, igScopedUserId, automationId, atIso) {
      const id = contactIdsBySender.get(`${workspaceId}:${instagramAccountId}:${igScopedUserId}`);
      if (!id) throw new Error("Contact not found");
      const current = contacts.get(id)!;
      const updated: AutomationContactRecord = {
        ...current,
        state: "AWAITING_EMAIL",
        awaitingAutomationId: automationId,
        awaitingSince: atIso,
        attempts: 0,
        updatedAt: now(),
      };
      contacts.set(id, updated);
      return copy(updated);
    },

    async captureContactEmail(workspaceId, instagramAccountId, igScopedUserId, email, atIso) {
      const id = contactIdsBySender.get(`${workspaceId}:${instagramAccountId}:${igScopedUserId}`);
      if (!id) throw new Error("Contact not found");
      const current = contacts.get(id)!;
      const updated: AutomationContactRecord = {
        ...current,
        email: email.trim().toLowerCase(),
        state: current.state === "AWAITING_EMAIL" ? "AWAITING_EMAIL" : "CAPTURED",
        ...(current.state === "AWAITING_EMAIL" ? {} : {
          awaitingAutomationId: undefined,
          awaitingSince: undefined,
        }),
        attempts: 0,
        lastSeenAt: atIso > current.lastSeenAt ? atIso : current.lastSeenAt,
        updatedAt: now(),
      };
      contacts.set(id, updated);
      return copy(updated);
    },

    async bumpContactEmailAttempt(workspaceId, instagramAccountId, igScopedUserId) {
      const id = contactIdsBySender.get(`${workspaceId}:${instagramAccountId}:${igScopedUserId}`);
      if (!id) throw new Error("Contact not found");
      const current = contacts.get(id)!;
      const updated: AutomationContactRecord = { ...current, attempts: current.attempts + 1, updatedAt: now() };
      contacts.set(id, updated);
      return updated.attempts;
    },

    async clearContactAwaitingEmail(workspaceId, instagramAccountId, igScopedUserId) {
      const id = contactIdsBySender.get(`${workspaceId}:${instagramAccountId}:${igScopedUserId}`);
      if (!id) return;
      const current = contacts.get(id)!;
      contacts.set(id, {
        ...current,
        state: current.email ? "CAPTURED" : "NONE",
        awaitingAutomationId: undefined,
        awaitingSince: undefined,
        awaitingFields: undefined,
        updatedAt: now(),
      });
    },

    async beginContactFieldCollection(workspaceId, instagramAccountId, igScopedUserId, remainingFields, automationId, atIso) {
      const id = contactIdsBySender.get(`${workspaceId}:${instagramAccountId}:${igScopedUserId}`);
      if (!id) throw new Error("Contact not found");
      const current = contacts.get(id)!;
      const updated: AutomationContactRecord = {
        ...current,
        state: "AWAITING_FIELD",
        awaitingAutomationId: automationId,
        awaitingSince: atIso,
        awaitingFields: copy(remainingFields),
        updatedAt: now(),
      };
      contacts.set(id, updated);
      return copy(updated);
    },

    async recordContactFieldAnswer(workspaceId, instagramAccountId, igScopedUserId, fieldId, answer, remainingAfter, atIso) {
      const id = contactIdsBySender.get(`${workspaceId}:${instagramAccountId}:${igScopedUserId}`);
      if (!id) throw new Error("Contact not found");
      const current = contacts.get(id)!;
      const updated: AutomationContactRecord = {
        ...current,
        fields: { ...(current.fields ?? {}), [fieldId]: answer.trim().slice(0, 200) },
        awaitingFields: copy(remainingAfter),
        state: remainingAfter.length > 0 ? "AWAITING_FIELD" : "CAPTURED",
        ...(remainingAfter.length === 0 ? { awaitingAutomationId: undefined, awaitingSince: undefined } : {}),
        lastSeenAt: atIso > current.lastSeenAt ? atIso : current.lastSeenAt,
        updatedAt: now(),
      };
      contacts.set(id, updated);
      return copy(updated);
    },

    async suppressContact(workspaceId, instagramAccountId, igScopedUserId, atIso) {
      const id = contactIdsBySender.get(`${workspaceId}:${instagramAccountId}:${igScopedUserId}`);
      if (!id) throw new Error("Contact not found");
      const current = contacts.get(id)!;
      const updated: AutomationContactRecord = {
        ...current,
        suppressedAt: current.suppressedAt ?? atIso,
        state: current.email ? "CAPTURED" : "NONE",
        awaitingAutomationId: undefined,
        awaitingSince: undefined,
        awaitingFields: undefined,
        lastSeenAt: atIso > current.lastSeenAt ? atIso : current.lastSeenAt,
        updatedAt: now(),
      };
      contacts.set(id, updated);
      await this.cancelEnrollmentsForContact(id);
      return copy(updated);
    },

    async countCapturedContacts(workspaceId) {
      return [...contacts.values()].filter(
        (contact) => contact.workspaceId === workspaceId && contact.state === "CAPTURED" && Boolean(contact.email),
      ).length;
    },

    async listCapturedContacts(workspaceId, limit): Promise<CapturedContactSummary[]> {
      return [...contacts.values()]
        .filter((contact) => contact.workspaceId === workspaceId && contact.state === "CAPTURED" && Boolean(contact.email))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
        .slice(0, limit)
        .map((contact) => ({
          id: contact.id,
          email: contact.email!,
          instagramAccountId: contact.instagramAccountId,
          capturedAt: contact.updatedAt,
        }));
    },

    async deleteContactsByWorkspaceIds(workspaceIds) {
      const workspaceIdSet = new Set(workspaceIds);
      let count = 0;
      for (const [id, contact] of contacts.entries()) {
        if (!workspaceIdSet.has(contact.workspaceId)) continue;
        contacts.delete(id);
        contactIdsBySender.delete(`${contact.workspaceId}:${contact.instagramAccountId}:${contact.igScopedUserId}`);
        count += 1;
      }
      return count;
    },

    async deleteAutomation(workspaceId, id) {
      const current = automations.get(id);
      if (!current || current.workspaceId !== workspaceId) return false;
      automations.delete(id);
      // Mirror the Prisma cascade so both repositories expose identical semantics.
      for (const [participantId, participant] of [...participants.entries()]) {
        if (participant.automationId !== id) continue;
        participants.delete(participantId);
        participantIdsBySource.delete(`${participant.workspaceId}:${participant.instagramAccountId}:${participant.sourceCommentId}`);
      }
      for (const [executionId, execution] of [...executions.entries()]) {
        if (execution.automationId === id) executions.delete(executionId);
      }
      return true;
    },

    async createSequence(workspaceId, input) {
      const timestamp = now();
      const record: AutomationSequenceRecord = {
        id: createId("sequence"),
        workspaceId,
        name: input.name.trim(),
        status: input.status,
        steps: copy(input.steps),
        ...(input.sourceAutomationId ? { sourceAutomationId: input.sourceAutomationId } : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      sequences.set(record.id, record);
      return copy(record);
    },

    async getSequence(workspaceId, id) {
      const record = sequences.get(id);
      return record?.workspaceId === workspaceId ? copy(record) : null;
    },

    async updateSequence(workspaceId, id, patch) {
      const current = sequences.get(id);
      if (!current || current.workspaceId !== workspaceId) return null;
      const updated: AutomationSequenceRecord = {
        ...current,
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.status !== undefined ? { status: patch.status satisfies SequenceStatus } : {}),
        ...(patch.steps !== undefined ? { steps: copy(patch.steps) } : {}),
        updatedAt: now(),
      };
      if (patch.sourceAutomationId === null) delete updated.sourceAutomationId;
      else if (patch.sourceAutomationId !== undefined) updated.sourceAutomationId = patch.sourceAutomationId;
      sequences.set(id, updated);
      return copy(updated);
    },

    async deleteSequence(workspaceId, id) {
      const record = sequences.get(id);
      if (!record || record.workspaceId !== workspaceId) return false;
      sequences.delete(id);
      for (const [enrollmentId, enrollment] of [...enrollments.entries()]) {
        if (enrollment.sequenceId === id) {
          enrollments.delete(enrollmentId);
          enrollmentIdsByPair.delete(`${enrollment.sequenceId}:${enrollment.contactId}`);
        }
      }
      return true;
    },

    async listSequences(workspaceId) {
      return copy(
        [...sequences.values()]
          .filter((sequence) => sequence.workspaceId === workspaceId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)),
      );
    },

    async listActiveSequencesForSource(workspaceId, sourceAutomationId) {
      return [...sequences.values()].filter(
        (sequence) =>
          sequence.workspaceId === workspaceId
          && sequence.status === "ACTIVE"
          && sequence.sourceAutomationId === sourceAutomationId
          && sequence.steps.length > 0,
      );
    },

    async countEnrollmentsBySequence(workspaceId): Promise<SequenceEnrollmentCount[]> {
      const counts = new Map<string, number>();
      for (const enrollment of enrollments.values()) {
        if (enrollment.workspaceId !== workspaceId || enrollment.state === "CANCELLED") continue;
        counts.set(enrollment.sequenceId, (counts.get(enrollment.sequenceId) ?? 0) + 1);
      }
      return [...counts.entries()].map(([sequenceId, count]) => ({ sequenceId, count }));
    },

    async enrollContactInSequence(workspaceId, sequenceId, contactId, firstDelayHours, nowIso) {
      const sequence = sequences.get(sequenceId);
      const contact = contacts.get(contactId);
      if (sequence?.workspaceId !== workspaceId || contact?.workspaceId !== workspaceId) return { created: false };
      const pairKey = `${sequenceId}:${contactId}`;
      const existingId = enrollmentIdsByPair.get(pairKey);
      if (existingId) return { created: false };
      const nextSendAtMs = Date.parse(nowIso) + firstDelayHours * 3_600_000;
      const record: SequenceEnrollmentRecord = {
        id: createId("enrollment"),
        workspaceId,
        sequenceId,
        contactId,
        currentStepIndex: 0,
        nextSendAt: new Date(nextSendAtMs).toISOString(),
        state: "ACTIVE",
        enrolledAt: nowIso,
        updatedAt: nowIso,
      };
      enrollments.set(record.id, record);
      enrollmentIdsByPair.set(pairKey, record.id);
      return { created: true };
    },

    async listDueSequenceSends(nowIso, limit): Promise<DueSequenceSend[]> {
      const nowMs = Date.parse(nowIso);
      const due: DueSequenceSend[] = [];
      for (const enrollment of enrollments.values()) {
        if (due.length >= limit) break;
        if (enrollment.state !== "ACTIVE") continue;
        const nextMs = enrollment.nextSendAt ? Date.parse(enrollment.nextSendAt) : Number.NaN;
        if (!Number.isFinite(nextMs) || nextMs > nowMs) continue;
        const sequence = sequences.get(enrollment.sequenceId);
        if (!sequence || sequence.status !== "ACTIVE") continue;
        const contact = contacts.get(enrollment.contactId);
        if (!contact || contact.suppressedAt) continue;
        due.push({ enrollment: copy(enrollment), sequence: copy(sequence), contact: copy(contact) });
      }
      return due.sort((a, b) =>
        (a.enrollment.nextSendAt ?? "").localeCompare(b.enrollment.nextSendAt ?? ""));
    },

    async advanceSequenceEnrollment(id, nextIndex, nextSendAtIso) {
      const enrollment = enrollments.get(id);
      if (!enrollment) return;
      const completed = nextSendAtIso === null;
      enrollments.set(id, {
        ...enrollment,
        currentStepIndex: nextIndex,
        nextSendAt: nextSendAtIso ?? undefined,
        state: (completed ? "COMPLETED" : "ACTIVE") satisfies EnrollmentState,
        updatedAt: now(),
      });
    },

    async cancelEnrollmentsForContact(contactId) {
      let count = 0;
      for (const [id, enrollment] of enrollments.entries()) {
        if (enrollment.contactId !== contactId || enrollment.state !== "ACTIVE") continue;
        enrollments.set(id, { ...enrollment, state: "CANCELLED", updatedAt: now() });
        count += 1;
      }
      return count;
    },

    async createBroadcast(workspaceId, input) {
      const timestamp = now();
      const record: BroadcastRecord = {
        id: createId("broadcast"),
        workspaceId,
        name: input.name.trim(),
        text: input.text,
        segment: input.segment satisfies BroadcastSegment,
        status: input.total > 0 ? "RUNNING" : "COMPLETED",
        total: input.total,
        sent: 0,
        failed: 0,
        skipped: 0,
        createdAt: timestamp,
        ...(input.total > 0 ? {} : { completedAt: timestamp }),
      };
      broadcasts.set(record.id, record);
      return copy(record);
    },

    async getBroadcast(workspaceId, id) {
      const record = broadcasts.get(id);
      return record?.workspaceId === workspaceId ? copy(record) : null;
    },

    async listBroadcasts(workspaceId, limit) {
      return copy(
        [...broadcasts.values()]
          .filter((broadcast) => broadcast.workspaceId === workspaceId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
          .slice(0, limit),
      );
    },

    async incrementBroadcastCounters(id, delta) {
      const broadcast = broadcasts.get(id);
      if (!broadcast) return;
      broadcasts.set(id, {
        ...broadcast,
        sent: broadcast.sent + (delta.sent ?? 0),
        failed: broadcast.failed + (delta.failed ?? 0),
        skipped: broadcast.skipped + (delta.skipped ?? 0),
      });
    },

    async finalizeBroadcastIfDone(workspaceId, id) {
      const broadcast = broadcasts.get(id);
      if (!broadcast || broadcast.workspaceId !== workspaceId) return;
      if (broadcast.status !== "RUNNING") return;
      if (broadcast.sent + broadcast.failed + broadcast.skipped < broadcast.total) return;
      broadcasts.set(id, { ...broadcast, status: "COMPLETED", completedAt: now() });
    },

    async getMessagingWindow(workspaceId) {
      return copy(messagingWindows.get(workspaceId) ?? null);
    },

    async setMessagingWindow(workspaceId, window) {
      if (window) messagingWindows.set(workspaceId, copy(window));
      else messagingWindows.delete(workspaceId);
    },

    async listBroadcastRecipients(workspaceId, segment, limit) {
      return [...contacts.values()]
        .filter((contact) => {
          if (contact.workspaceId !== workspaceId || contact.suppressedAt) return false;
          if (segment === "captured_email") return contact.state === "CAPTURED" && Boolean(contact.email);
          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
        .slice(0, limit)
        .map((contact) => ({ igScopedUserId: contact.igScopedUserId, instagramAccountId: contact.instagramAccountId }));
    },
  };
}
