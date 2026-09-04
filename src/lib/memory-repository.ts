import { createId } from "./id";
import { tallyVariantPerformance } from "./insights/variant-performance";
import type {
  AutomationRecord,
  AutomationParticipantRecord,
  AutomationRepository,
  AutomationVersionRecord,
  TrackedLinkRecord,
  TrackedLinkClickRecord,
  TrackedLinkStats,
  CreateAutomationInput,
  CreateParticipantInput,
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
  CreateInvitationInput,
  AutomationContactRecord,
  CapturedContactSummary,
  LeadStatus,
  TouchContactResult,
  ContactTimelineEntry,
  VariantPerformance,
  WebhookEventRecord,
  RecordWebhookEventInput,
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
  WorkspaceStatus,
  HelpSearchRecord,
  HelpFeedbackRecord,
} from "./repository";
import { broadcastSegmentCutoff, InstagramAccountOwnershipError, FacebookPageOwnershipError, AUTOMATIC_CONTACT_TAGS, LEAD_STATUS_SCORE_DELTA } from "./repository";
import type { EmailCaptureField } from "./automation/types";
import { normalizeHelpQuery } from "./help-search";

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

type LegacyAutomationSeed = Omit<AutomationRecord, "provider"> & { provider?: AutomationRecord["provider"] };

export function createMemoryRepository(seed: LegacyAutomationSeed[] = []): AutomationRepository {
  const automations = new Map(seed.map((automation) => {
    const normalized: AutomationRecord = {
      ...copy(automation),
      provider: automation.provider ?? (automation.facebookPageId ? "FACEBOOK" : "INSTAGRAM"),
    };
    return [normalized.id, normalized];
  }));
  const connections = new Map<string, InstagramConnectionRecord>();
  const facebookPages = new Map<string, FacebookPageConnectionRecord>();
  const facebookReplyRecipients = new Map<string, {
    eventId: string;
    claimExpiresAt: string;
    repliedAt?: string;
  }>();
  const executions = new Map<string, ExecutionRecord>();
  const outboundDeliveries = new Map<string, OutboundDeliveryRecord>();
  const outboundUsageReservations = new Map<string, string>();
  const outboundMonthlyUsage = new Map<string, number>();
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
  // Keyed by automationId so we can answer "what is the next version number?" in O(1).
  const automationVersions = new Map<string, AutomationVersionRecord[]>();
  // Tracked short links: keyed by link id; clicks keyed by link id too.
  const trackedLinks = new Map<string, TrackedLinkRecord>();
  const trackedLinkSlugs = new Map<string, string>(); // `${workspaceId}:${slug}` -> link id
  const trackedLinkClicks = new Map<string, TrackedLinkClickRecord[]>();
  // email -> workspaceId, mirroring WorkspaceMember rows for login lookups.
  const memberWorkspacesByEmail = new Map<string, string>();
  const membersByEmail = new Map<string, MemberRecord>();
  const invitationsById = new Map<string, InvitationRecord>();
  const workspaceLifecycle = new Map<string, {
    status: WorkspaceStatus;
    suspendedAt?: string;
    suspendedReason?: string;
    suspendedByUserId?: string;
    deletionScheduledAt?: string;
  }>();
  // Keyed by `${workspaceId}:${providerEventId}` so replays stay idempotent.
  const webhookEvents = new Map<string, WebhookEventRecord & { workspaceId: string }>();
  const helpSearches = new Map<string, HelpSearchRecord>();
  const helpFeedback = new Map<string, HelpFeedbackRecord>();

  return {
    async ensureWorkspace(workspaceId, ownerEmail, ownerUserId) {
      if (!ownerEmail) return;
      const email = ownerEmail.toLowerCase();
      memberWorkspacesByEmail.set(email, workspaceId);
      workspaceLifecycle.set(workspaceId, workspaceLifecycle.get(workspaceId) ?? { status: "ACTIVE" });
      const key = `${workspaceId}:${email}`;
      if (!membersByEmail.has(key)) {
        membersByEmail.set(key, {
          id: createId("member"),
          workspaceId,
          email,
          role: "OWNER",
          userId: ownerUserId,
        });
      } else if (ownerUserId) {
        membersByEmail.set(key, { ...membersByEmail.get(key)!, userId: ownerUserId });
      }
    },

    async listMembers(workspaceId) {
      return copy([...membersByEmail.values()].filter((member) => member.workspaceId === workspaceId));
    },

    async listWorkspaceMembershipsByUserId(userId) {
      return copy([...membersByEmail.values()].filter((member) => member.userId === userId));
    },

    async findWorkspaceIdByMemberUserId(userId) {
      return [...membersByEmail.values()].find((member) => member.userId === userId)?.workspaceId ?? null;
    },

    async bindMemberUserId(workspaceId, email, userId) {
      const key = `${workspaceId}:${email.toLowerCase()}`;
      const member = membersByEmail.get(key);
      if (!member) return false;
      const collision = [...membersByEmail.values()].some(
        (candidate) => candidate.workspaceId === workspaceId && candidate.userId === userId && candidate.id !== member.id,
      );
      if (collision) return false;
      membersByEmail.set(key, { ...member, userId });
      return true;
    },

    async setWorkspaceLifecycle(workspaceId, change) {
      if (!workspaceLifecycle.has(workspaceId)) return false;
      workspaceLifecycle.set(workspaceId, {
        status: change.status,
        ...(change.status === "SUSPENDED" ? {
          suspendedAt: change.at,
          suspendedReason: change.reason,
          suspendedByUserId: change.actorUserId,
        } : {}),
        ...(change.status === "DELETION_PENDING" && change.deletionScheduledAt
          ? { deletionScheduledAt: change.deletionScheduledAt }
          : {}),
      });
      return true;
    },

    async getWorkspaceStatus(workspaceId) {
      return workspaceLifecycle.get(workspaceId)?.status ?? "ACTIVE";
    },

    async getApplicationAccessState(userId, workspaceId) {
      const isMember = [...membersByEmail.values()].some(
        (member) => member.workspaceId === workspaceId && member.userId === userId,
      );
      const lifecycle = workspaceLifecycle.get(workspaceId);
      if (!isMember || !lifecycle) return null;
      return { userStatus: "ACTIVE", workspaceStatus: lifecycle.status, sessionInvalidBefore: null };
    },

    async getPlatformUserControlState() {
      return { status: "ACTIVE", sessionInvalidBefore: null };
    },

    async getMemberRole(workspaceId, email) {
      return membersByEmail.get(`${workspaceId}:${email.toLowerCase()}`)?.role ?? null;
    },

    async addMember(workspaceId, email, role: MemberRole, userId) {
      const key = `${workspaceId}:${email.toLowerCase()}`;
      if (membersByEmail.has(key)) return { created: false };
      membersByEmail.set(key, { id: createId("member"), workspaceId, email: email.toLowerCase(), role, userId });
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

    async acceptInvitation(id, nowIso, userId) {
      const record = invitationsById.get(id);
      if (!record || record.acceptedAt || record.revokedAt || record.expiresAt <= nowIso) return null;
      const accepted: InvitationRecord = { ...record, acceptedAt: nowIso };
      invitationsById.set(id, accepted);
      await this.addMember(record.workspaceId, record.email, record.role, userId);
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

    async countParticipantsBySender(automationId, instagramAccountId, igScopedUserId) {
      let count = 0;
      for (const participant of participants.values()) {
        if (participant.automationId !== automationId) continue;
        if (participant.instagramAccountId !== instagramAccountId) continue;
        if (participant.igScopedUserId !== igScopedUserId) continue;
        count += 1;
      }
      return count;
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
      // Engagement hook: tag + score the contact when the click is attributable.
      if (record.igScopedUserId) {
        await this.addContactTags(record.workspaceId, record.instagramAccountId, record.igScopedUserId, ["clicked"]);
        await this.bumpContactScore(record.workspaceId, record.instagramAccountId, record.igScopedUserId, 5);
      }
      return true;
    },

    async pauseParticipant(id, reason, userId, atIso) {
      const record = participants.get(id);
      if (!record) return null;
      const updated: AutomationParticipantRecord = {
        ...record,
        pausedAt: atIso,
        pausedReason: reason,
        pausedByUserId: userId,
        updatedAt: now(),
      };
      participants.set(id, updated);
      return copy(updated);
    },

    async resumeParticipant(id, atIso) {
      const record = participants.get(id);
      if (!record || !record.pausedAt) return record ? copy(record) : null;
      const updated: AutomationParticipantRecord = {
        ...record,
        pausedAt: undefined,
        pausedReason: undefined,
        pausedByUserId: undefined,
        updatedAt: atIso,
      };
      participants.set(id, updated);
      return copy(updated);
    },

    async pauseParticipantsBySender(workspaceId, instagramAccountId, igScopedUserId, reason, userId, atIso) {
      let count = 0;
      for (const [id, participant] of participants.entries()) {
        if (
          participant.workspaceId !== workspaceId
          || participant.instagramAccountId !== instagramAccountId
          || participant.igScopedUserId !== igScopedUserId
        ) continue;
        if (participant.pausedAt) continue;
        participants.set(id, {
          ...participant,
          pausedAt: atIso,
          pausedReason: reason,
          pausedByUserId: userId,
          updatedAt: now(),
        });
        count += 1;
      }
      return count;
    },

    async listPausedParticipantsByWorkspace(workspaceId, limit) {
      return copy(
        [...participants.values()]
          .filter((participant) => participant.workspaceId === workspaceId && Boolean(participant.pausedAt))
          .sort((a, b) => (b.pausedAt ?? "").localeCompare(a.pausedAt ?? ""))
          .slice(0, limit),
      );
    },

    async hasPausedParticipant(workspaceId, instagramAccountId, igScopedUserId) {
      return [...participants.values()].some((participant) =>
        participant.workspaceId === workspaceId
        && participant.instagramAccountId === instagramAccountId
        && participant.igScopedUserId === igScopedUserId
        && Boolean(participant.pausedAt));
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

    async listActiveAutomationsForInstagramAccount(workspaceId, instagramAccountId) {
      return copy(
        [...automations.values()]
          .filter((automation) =>
            automation.workspaceId === workspaceId
            && automation.status === "ACTIVE"
            && automation.provider === "INSTAGRAM"
            && (automation.instagramAccountId === undefined || automation.instagramAccountId === instagramAccountId))
          .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
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
        provider: input.provider ?? (input.facebookPageId ? "FACEBOOK" : "INSTAGRAM"),
        name: input.name.trim(),
        status: "DRAFT",
        version: input.definition.version,
        definition: copy(input.definition),
        priority: input.priority ?? 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      if (input.instagramAccountId) automation.instagramAccountId = input.instagramAccountId;
      if (input.facebookPageId) automation.facebookPageId = input.facebookPageId;
      automations.set(automation.id, automation);
      return copy(automation);
    },

    async updateAutomation(workspaceId, id, patch: UpdateAutomationInput) {
      const current = automations.get(id);
      if (!current || current.workspaceId !== workspaceId) return null;
      const { boundMediaId, instagramAccountId, facebookPageId, provider, ...rest } = patch;
      // Mutual exclusion: clearing one channel implicitly unpins the other so
      // a single PATCH never leaves an automation pinned to two channels at
      // once. The route layer also rejects explicit dual-pins; this is the
      // last line of defense.
      const clearingInstagram = instagramAccountId === null;
      const clearingFacebook = facebookPageId === null;
      const updated: AutomationRecord = {
        ...current,
        ...rest,
        provider: provider
          ?? (facebookPageId ? "FACEBOOK" : instagramAccountId ? "INSTAGRAM" : current.provider),
        ...(boundMediaId === undefined ? {} : { boundMediaId: boundMediaId ?? undefined }),
        ...(instagramAccountId === undefined
          ? clearingFacebook
            ? { instagramAccountId: undefined }
            : {}
          : { instagramAccountId: instagramAccountId ?? undefined }),
        ...(facebookPageId === undefined
          ? clearingInstagram
            ? { facebookPageId: undefined }
            : {}
          : { facebookPageId: facebookPageId ?? undefined }),
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

    // Facebook Page support (parallel to the IG block above). Only a tiny
    // surface for v1 (comment-reply automation) - no participants, contacts,
    // or sequences yet.
    async listFacebookPages(workspaceId) {
      return copy([...facebookPages.values()].filter((page) => page.workspaceId === workspaceId));
    },
    async findWorkspaceByFacebookPage(pageId) {
      const page = [...facebookPages.values()].find(
        (candidate) => candidate.pageId === pageId && candidate.status === "CONNECTED",
      );
      return page ? { workspaceId: page.workspaceId, page: copy(page) } : null;
    },
    async upsertFacebookPage(input) {
      const existing = [...facebookPages.values()].find((page) => page.pageId === input.pageId);
      if (existing && existing.workspaceId !== input.workspaceId) {
        throw new FacebookPageOwnershipError();
      }
      const record: FacebookPageConnectionRecord = {
        id: existing?.id ?? createId("facebook_page"),
        ...input,
        connectedAt: existing?.connectedAt ?? now(),
      };
      facebookPages.set(record.id, record);
      return copy(record);
    },
    async updateFacebookPageToken(id, accessTokenEncrypted, tokenExpiresAt) {
      const page = facebookPages.get(id);
      if (!page) return;
      facebookPages.set(id, { ...page, accessTokenEncrypted, ...(tokenExpiresAt ? { tokenExpiresAt } : {}) });
    },
    async updateFacebookPageStatus(id, status) {
      const page = facebookPages.get(id);
      if (!page) return;
      facebookPages.set(id, { ...page, status });
    },
    async deleteFacebookPageByPageId(pageId) {
      for (const [id, page] of facebookPages.entries()) {
        if (page.pageId === pageId) facebookPages.delete(id);
      }
    },
    async deleteFacebookPagesByUserId(facebookUserId) {
      const removedPageIds = new Set<string>();
      for (const [id, page] of facebookPages.entries()) {
        if (page.facebookUserId !== facebookUserId) continue;
        removedPageIds.add(page.pageId);
        facebookPages.delete(id);
      }
      for (const [id, automation] of automations.entries()) {
        if (automation.facebookPageId && removedPageIds.has(automation.facebookPageId)) {
          automations.set(id, { ...automation, facebookPageId: undefined, status: "PAUSED", version: automation.version + 1 });
        }
      }
    },
    async deleteFacebookPage(workspaceId, id) {
      const page = facebookPages.get(id);
      if (!page || page.workspaceId !== workspaceId) return false;
      facebookPages.delete(id);
      // Unpin any automations that were pinned to this page so the runner
      // never tries to dispatch to a deleted account. The automation itself
      // is preserved - the user can repin or delete it explicitly.
      for (const [aid, automation] of automations.entries()) {
        if (automation.workspaceId === workspaceId && automation.facebookPageId === page.pageId) {
          automations.set(aid, { ...automation, facebookPageId: undefined, status: "PAUSED", version: automation.version + 1 });
        }
      }
      return true;
    },
    async claimFacebookReplyRecipient(input) {
      const key = `${input.automationId}\0${input.pageId}\0${input.senderId}`;
      const existing = facebookReplyRecipients.get(key);
      if (
        existing?.repliedAt
        || (existing && existing.eventId !== input.eventId && existing.claimExpiresAt > input.claimedAt)
      ) return false;
      facebookReplyRecipients.set(key, {
        eventId: input.eventId,
        claimExpiresAt: input.claimExpiresAt,
      });
      return true;
    },
    async completeFacebookReplyRecipient(automationId, pageId, senderId, eventId, repliedAt) {
      const key = `${automationId}\0${pageId}\0${senderId}`;
      const existing = facebookReplyRecipients.get(key);
      if (existing?.eventId === eventId) facebookReplyRecipients.set(key, { ...existing, repliedAt });
    },
    async releaseFacebookReplyRecipient(automationId, pageId, senderId, eventId) {
      const key = `${automationId}\0${pageId}\0${senderId}`;
      if (facebookReplyRecipients.get(key)?.eventId === eventId) facebookReplyRecipients.delete(key);
    },
    async beginFacebookDataDeletion(facebookUserId, confirmationCode, signedRequestHash) {
      const removedPageIds = new Set<string>();
      for (const [id, page] of facebookPages.entries()) {
        if (page.facebookUserId !== facebookUserId) continue;
        removedPageIds.add(page.pageId);
        facebookPages.delete(id);
      }
      for (const [id, automation] of automations.entries()) {
        if (automation.facebookPageId && removedPageIds.has(automation.facebookPageId)) automations.delete(id);
      }
      const record: DataDeletionRequestRecord = {
        confirmationCode,
        signedRequestHash,
        status: "PENDING",
        requestedAt: now(),
      };
      deletionRequests.set(confirmationCode, record);
      return copy(record);
    },
    async listAutomationsForFacebookPage(workspaceId, pageId) {
      return copy(
        [...automations.values()].filter(
          (automation) =>
            automation.workspaceId === workspaceId
            && automation.facebookPageId === pageId
            && automation.status === "ACTIVE",
        ),
      );
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
      // Every message ever sent to/for this account - never covered before, so
      // a "delete my data" request left DM payloads and recipient IDs behind
      // indefinitely.
      for (const [key, delivery] of outboundDeliveries.entries()) {
        if (delivery.instagramAccountId === igUserId) outboundDeliveries.delete(key);
      }
      // Automations pinned to the deleted account can never fire again; remove
      // them even when sibling connections keep the workspace alive.
      for (const [id, automation] of automations.entries()) {
        if (workspaceIds.has(automation.workspaceId) && automation.instagramAccountId === igUserId) automations.delete(id);
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
        // Scoped to provider === "INSTAGRAM", not just workspaceId - a workspace can
        // also have Facebook Page automations, and those must survive an
        // Instagram-only deletion request. (instagramAccountId being null does NOT
        // mean "not Instagram" - it means "applies to every connected Instagram
        // account in the workspace"; `provider` is the real channel discriminator.)
        // Capture which automation IDs are removed here so the execution sweep
        // below can key off that instead of a live map lookup (the automation row
        // is already gone by the time executions are swept).
        const deletedInstagramAutomationIds = new Set<string>();
        for (const [id, automation] of automations.entries()) {
          if (automation.workspaceId !== workspaceId || automation.provider !== "INSTAGRAM") continue;
          automations.delete(id);
          deletedInstagramAutomationIds.add(id);
        }
        for (const [id, execution] of executions.entries()) {
          if (execution.workspaceId === workspaceId && deletedInstagramAutomationIds.has(execution.automationId)) executions.delete(id);
        }
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

    async recordExecutions(inputs) {
      let created = 0;
      for (const input of inputs) {
        const existing = [...executions.values()].some(
          (record) => record.workspaceId === input.workspaceId && record.dedupeKey === input.dedupeKey,
        );
        if (existing) continue;
        const record: ExecutionRecord = {
          id: createId("execution"),
          createdAt: now(),
          ...input,
          dispatchStatus: input.dispatchStatus ?? "CLAIMED",
        };
        executions.set(record.id, record);
        created += 1;
      }
      return created;
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
      // The same dedupeKey is first written by recordExecution (PROCESSING/CLAIMED)
      // and then advanced to DISPATCHING here. Look for the prior row by
      // (workspaceId, dedupeKey) and only succeed if it is still in a
      // claimable state. The dispatchOwner collision check stays as a
      // secondary guard so two concurrent dispatchers cannot both win,
      // and the global dispatchOwner uniqueness check rejects token reuse
      // across executions.
      const ownerInUse = [...executions.values()].some(
        (record) => record.dispatchOwner === input.dispatchOwner,
      );
      if (ownerInUse) return false;
      const existing = [...executions.values()].find(
        (record) =>
          record.workspaceId === input.workspaceId
          && record.dedupeKey === input.dedupeKey,
      );
      if (!existing) {
        // No prior recordExecution for this key - create one (rare; happens
        // for the first time a brand-new action is claimed).
        const record: ExecutionRecord = {
          id: createId("execution"),
          createdAt: now(),
          status: "PROCESSING",
          dispatchStatus: "DISPATCHING",
          ...input,
        };
        executions.set(record.id, record);
        return true;
      }
      // If the prior row already has a different dispatch owner actively
      // dispatching, refuse to clobber it. The owner above is unused, so
      // the conflict is the existing dispatch.
      if (
        existing.status === "PROCESSING"
        && existing.dispatchStatus === "DISPATCHING"
        && existing.dispatchOwner
        && existing.dispatchOwner !== input.dispatchOwner
      ) {
        return false;
      }
      // Existing record must still be PROCESSING (CLAIMED) to be claimable.
      // A terminal status (SENT/FAILED/SKIPPED) means the work is already
      // done; return false so the caller can short-circuit.
      if (existing.status !== "PROCESSING") return false;
      const updated: ExecutionRecord = {
        ...existing,
        dispatchStatus: "DISPATCHING",
        dispatchOwner: input.dispatchOwner,
        dispatchStartedAt: input.dispatchStartedAt,
        dispatchLeaseExpiresAt: input.dispatchLeaseExpiresAt,
      };
      executions.set(existing.id, updated);
      return true;
    },

    async getExecution(workspaceId, dedupeKey) {
      const record = [...executions.values()].find(
        (candidate) => candidate.workspaceId === workspaceId && candidate.dedupeKey === dedupeKey,
      );
      return record ? copy(record) : null;
    },

    async listAutomationExecutions(workspaceId, automationId, limit) {
      return [...executions.values()]
        .filter((record) => record.workspaceId === workspaceId && record.automationId === automationId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, Math.min(100, Math.max(0, limit)))
        .map(copy);
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

    async listRecentOutboundFailures(workspaceId, limit) {
      return copy(
        [...outboundDeliveries.values()]
          .filter((record) => record.workspaceId === workspaceId && record.state === "FAILED")
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
          .slice(0, limit),
      );
    },

    async listOutboundDeliveriesForRecipient(workspaceId, instagramAccountId, recipientId, limit) {
      return copy(
        [...outboundDeliveries.values()]
          .filter((record) => record.workspaceId === workspaceId
            && record.instagramAccountId === instagramAccountId
            && record.recipientId === recipientId)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
          .slice(0, Math.max(0, limit)),
      );
    },

    async ensureOutboundDelivery(input: EnsureOutboundDeliveryInput) {
      // Two concurrent callers can both observe the !existing branch and try
      // to insert; the second set() would win and bump the id. The Prisma
      // repository gets a transactional upsert for free; here we approximate
      // it by re-checking after the id-allocating await and preferring the
      // already-stored record when present.
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
      // Re-check the map now that any interleaved caller may have inserted.
      // If we find a different record, prefer it (matching the unique-key
      // semantics) and discard the freshly-built one.
      const winner = outboundDeliveries.get(input.deliveryKey);
      if (winner && winner !== record) return copy(winner);
      if (winner) {
        // Same reference: we are the only writer. Keep the freshest payload
        // but preserve the original id.
        record.id = winner.id;
        record.createdAt = winner.createdAt;
        outboundDeliveries.set(input.deliveryKey, record);
        return copy(record);
      }
      outboundDeliveries.set(record.deliveryKey, record);
      return copy(record);
    },

    async getOutboundDelivery(deliveryKey) {
      const record = outboundDeliveries.get(deliveryKey);
      return record ? copy(record) : null;
    },

    async prepareOutboundDelivery(input) {
      const { owner, leaseUntil, periodStart, monthlyLimit, ...deliveryInput } = input;
      validateUtcDate(periodStart);
      if (monthlyLimit !== null && (!Number.isInteger(monthlyLimit) || monthlyLimit < 0)) {
        throw new Error("monthlyLimit must be a non-negative integer or null");
      }

      let existing = outboundDeliveries.get(input.deliveryKey);
      if (!existing) {
        const timestamp = now();
        existing = {
          ...copy(deliveryInput),
          id: createId("delivery"),
          state: "PENDING",
          retryable: false,
          attemptCount: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        outboundDeliveries.set(input.deliveryKey, existing);
      }
      if (
        existing.state === "SENT"
        || existing.state === "UNKNOWN"
        || (existing.state === "FAILED" && !existing.retryable)
      ) {
        return { status: "TERMINAL" as const, record: existing };
      }
      if (existing.state === "CLAIMED") {
        return { status: "BUSY" as const, record: existing };
      }

      const claimed: OutboundDeliveryRecord = {
        ...existing,
        state: "CLAIMED",
        retryable: false,
        resultCode: undefined,
        claimOwner: owner,
        claimExpiresAt: leaseUntil,
        attemptCount: existing.attemptCount + 1,
        lastError: undefined,
        updatedAt: now(),
      };
      outboundDeliveries.set(input.deliveryKey, claimed);

      if (outboundUsageReservations.has(input.deliveryKey)) {
        return { status: "CLAIMED" as const, record: copy(claimed) };
      }

      const usageKey = `${existing.workspaceId}:${periodStart}`;
      const used = outboundMonthlyUsage.get(usageKey) ?? 0;
      if (monthlyLimit !== null && used >= monthlyLimit) {
        const rejected: OutboundDeliveryRecord = {
          ...claimed,
          state: "FAILED",
          retryable: false,
          resultCode: "SUPPRESSED",
          claimOwner: undefined,
          claimExpiresAt: undefined,
          lastError: "Monthly delivery limit reached",
          updatedAt: now(),
        };
        outboundDeliveries.set(input.deliveryKey, rejected);
        return { status: "QUOTA_REJECTED" as const, record: copy(rejected) };
      }

      outboundUsageReservations.set(input.deliveryKey, usageKey);
      outboundMonthlyUsage.set(usageKey, used + 1);
      return { status: "CLAIMED" as const, record: copy(claimed) };
    },

    async releaseOutboundDeliveryReservation(deliveryKey) {
      const usageKey = outboundUsageReservations.get(deliveryKey);
      if (!usageKey) return false;
      outboundUsageReservations.delete(deliveryKey);
      outboundMonthlyUsage.set(usageKey, Math.max(0, (outboundMonthlyUsage.get(usageKey) ?? 0) - 1));
      return true;
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

    async listOutboundDeliveryProblems(workspaceId, limit) {
      return copy([...outboundDeliveries.values()]
        .filter((record) => record.workspaceId === workspaceId && (record.state === "FAILED" || record.state === "UNKNOWN"))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, Math.min(100, Math.max(0, limit))));
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
      // Compare-and-set: re-read after the local copy is taken so a
      // concurrent writer that ran during an await boundary cannot sneak
      // past the expectedStates check. JS is single-threaded, but two
      // await-separated pieces of code can interleave; without the re-read
      // a second writer could see a stale state and overwrite the first.
      const current = participants.get(id);
      if (!current || !expectedStates.includes(current.state)) return null;
      const updated: AutomationParticipantRecord = { ...current, ...patch, updatedAt: now() };
      // Re-check immediately before the write: a concurrent transition
      // (and subsequent set) would have already left the map holding a
      // record whose state no longer matches expectedStates. Drop the
      // update in that case so the caller's intended CAS-style transition
      // fails closed.
      const refetched = participants.get(id);
      if (!refetched || refetched !== current || !expectedStates.includes(refetched.state)) {
        return null;
      }
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
          const updated: AutomationContactRecord = {
            ...existing,
            createdAt: seenAt < existing.createdAt ? seenAt : existing.createdAt,
            lastSeenAt: seenAt > existing.lastSeenAt ? seenAt : existing.lastSeenAt,
            inboxStatus: "OPEN",
            updatedAt: now(),
          };
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
        tags: [],
        score: 0,
        leadStatus: "NEW",
        inboxStatus: "OPEN",
        inboxFavorite: false,
        // Honour the caller's timestamp verbatim, exactly as the Prisma
        // repository does. This used to floor a new contact's lastSeenAt at
        // now(), which the update path above never did - so a contact created
        // from a backdated webhook read as "just seen", and any 24-hour
        // messaging-window check against it silently passed.
        lastSeenAt: seenAt,
        createdAt: seenAt,
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

    async getContactsByInstagramIdentities(workspaceId, identities) {
      const result: AutomationContactRecord[] = [];
      const seen = new Set<string>();
      for (const identity of identities) {
        const senderKey = `${workspaceId}:${identity.instagramAccountId}:${identity.igScopedUserId}`;
        if (seen.has(senderKey)) continue;
        seen.add(senderKey);
        const id = contactIdsBySender.get(senderKey);
        const record = id ? contacts.get(id) : undefined;
        if (record) result.push(record);
      }
      return copy(result);
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
        tags: current.tags.includes("email_captured") ? current.tags : [...current.tags, "email_captured"],
        score: Math.min(current.score + 10, 9999),
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
        tags: current.tags.includes("opted_out") ? current.tags : [...current.tags, "opted_out"],
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

    async countSuppressedContacts(workspaceId) {
      return [...contacts.values()].filter((c) => c.workspaceId === workspaceId && Boolean(c.suppressedAt)).length;
    },

    async getContactById(workspaceId, contactId) {
      const record = contacts.get(contactId);
      return record && record.workspaceId === workspaceId ? copy(record) : null;
    },

    async setContactTags(workspaceId, instagramAccountId, igScopedUserId, tags) {
      const id = contactIdsBySender.get(`${workspaceId}:${instagramAccountId}:${igScopedUserId}`);
      if (!id) return null;
      const current = contacts.get(id);
      if (!current) return null;
      // Manual tags replace previous manual tags; automatic labels always survive.
      const automatic = current.tags.filter((tag) => (AUTOMATIC_CONTACT_TAGS as readonly string[]).includes(tag));
      const manual = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]
        .filter((tag) => !(AUTOMATIC_CONTACT_TAGS as readonly string[]).includes(tag))
        .slice(0, 20);
      const updated: AutomationContactRecord = { ...current, tags: [...automatic, ...manual], updatedAt: now() };
      contacts.set(id, updated);
      return copy(updated);
    },

    async addContactTags(workspaceId, instagramAccountId, igScopedUserId, tags) {
      const id = contactIdsBySender.get(`${workspaceId}:${instagramAccountId}:${igScopedUserId}`);
      if (!id) return null;
      const current = contacts.get(id);
      if (!current) return null;
      const merged = [...new Set([...current.tags, ...tags.map((t) => t.trim().toLowerCase()).filter(Boolean)])];
      if (merged.length === current.tags.length) return copy(current);
      const updated: AutomationContactRecord = { ...current, tags: merged.slice(0, 30), updatedAt: now() };
      contacts.set(id, updated);
      return copy(updated);
    },

    async bumpContactScore(workspaceId, instagramAccountId, igScopedUserId, delta) {
      const id = contactIdsBySender.get(`${workspaceId}:${instagramAccountId}:${igScopedUserId}`);
      if (!id) return -1;
      const current = contacts.get(id);
      if (!current) return -1;
      const score = Math.min(Math.max(current.score + delta, 0), 9999);
      const updated: AutomationContactRecord = { ...current, score, updatedAt: now() };
      contacts.set(id, updated);
      return score;
    },

    async getContactTimeline(workspaceId, contactId, limit): Promise<ContactTimelineEntry[]> {
      const contact = contacts.get(contactId);
      if (!contact || contact.workspaceId !== workspaceId) return [];
      const entries: ContactTimelineEntry[] = [];
      for (const participant of participants.values()) {
        if (
          participant.workspaceId !== workspaceId
          || participant.instagramAccountId !== contact.instagramAccountId
          || participant.igScopedUserId !== contact.igScopedUserId
        ) continue;
        entries.push({
          id: `participant:${participant.id}`,
          kind: "interaction",
          at: participant.createdAt,
          label: participant.state === "LINK_SENT" ? "Campaign delivery sent" : "Campaign interaction",
          detail: participant.matchedKeyword ? `keyword "${participant.matchedKeyword}"` : participant.state,
        });
      }
      for (const enrollment of enrollments.values()) {
        if (enrollment.workspaceId !== workspaceId || enrollment.contactId !== contact.id) continue;
        entries.push({
          id: `enrollment:${enrollment.id}`,
          kind: "sequence",
          at: enrollment.enrolledAt,
          label: "Sequence enrollment",
          detail: sequences.get(enrollment.sequenceId)?.name ?? enrollment.sequenceId,
        });
      }
      if (contact.email) {
        entries.push({ id: "milestone:email", kind: "email_captured", at: contact.updatedAt, label: "Email captured", detail: contact.email });
      }
      if (contact.suppressedAt) {
        entries.push({ id: "milestone:optout", kind: "opted_out", at: contact.suppressedAt, label: "Opted out" });
      }
      return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
    },

    async updateContactProfile(workspaceId, contactId, patch) {
      const current = contacts.get(contactId);
      if (!current || current.workspaceId !== workspaceId) return null;
      const updated: AutomationContactRecord = { ...current, updatedAt: now() };
      if (patch.leadStatus && patch.leadStatus !== current.leadStatus) {
        const delta = LEAD_STATUS_SCORE_DELTA[patch.leadStatus] - LEAD_STATUS_SCORE_DELTA[current.leadStatus];
        updated.leadStatus = patch.leadStatus;
        if (delta !== 0) {
          updated.score = Math.min(Math.max(current.score + delta, 0), 9999);
        }
      }
      if (patch.assigneeUserId !== undefined) {
        updated.assigneeUserId = patch.assigneeUserId || undefined;
      }
      if (patch.notes !== undefined) {
        const trimmed = patch.notes?.trim();
        updated.notes = trimmed ? trimmed.slice(0, 4000) : undefined;
      }
      if (patch.sourceAutomationId !== undefined) {
        updated.sourceAutomationId = patch.sourceAutomationId || undefined;
      }
      contacts.set(contactId, updated);
      return copy(updated);
    },

    async countContactsByLeadStatus(workspaceId) {
      const counts: Record<LeadStatus, number> = { NEW: 0, ENGAGED: 0, QUALIFIED: 0, CUSTOMER: 0 };
      for (const contact of contacts.values()) {
        if (contact.workspaceId !== workspaceId) continue;
        counts[contact.leadStatus] += 1;
      }
      return counts;
    },

    async listContactsByLeadStatus(workspaceId, options) {
      const filtered = [...contacts.values()].filter((contact) => {
        if (contact.workspaceId !== workspaceId) return false;
        if (options.leadStatus && contact.leadStatus !== options.leadStatus) return false;
        return true;
      });
      return copy(
        filtered
          .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || a.id.localeCompare(b.id))
          .slice(0, options.limit),
      );
    },

    async countParticipantsByVariant(workspaceId, automationId) {
      // Shares the Prisma path's tally so the two implementations cannot drift:
      // this one already normalized before bucketing, which is why the suite
      // never caught the duplicate-"Variant A" bug in the SQL path.
      const mine = [...participants.values()].filter(
        (participant) => participant.workspaceId === workspaceId && participant.automationId === automationId,
      );
      const counts = (matches: typeof mine) =>
        matches.map((participant) => ({ variantLabel: participant.variantLabel ?? null, count: 1 }));
      return tallyVariantPerformance({
        participants: counts(mine),
        delivered: counts(mine.filter((participant) => participant.finalDeliveryStatus === "SENT")),
        clicked: counts(mine.filter((participant) => participant.deliveryClickedAt)),
      });
    },

    async recordWebhookEvent(workspaceId, input) {
      const dedupeKey = `${workspaceId}:${input.providerEventId}`;
      if (webhookEvents.has(dedupeKey)) return;
      webhookEvents.set(dedupeKey, {
        id: createId("wevent"),
        workspaceId,
        providerEventId: input.providerEventId,
        eventType: input.eventType,
        receivedAt: input.receivedAt,
        payload: copy(input.payload),
      });
    },

    async listRecentWebhookEvents(workspaceId, limit, eventType) {
      return [...webhookEvents.values()]
        .filter((event) => event.workspaceId === workspaceId && (!eventType || event.eventType === eventType))
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
        .slice(0, limit)
        .map(copy);
    },

    async deleteOldWebhookEvents(before) {
      const beforeMs = Date.parse(before);
      let count = 0;
      for (const [key, event] of webhookEvents.entries()) {
        if (Date.parse(event.receivedAt) >= beforeMs) continue;
        webhookEvents.delete(key);
        count += 1;
      }
      return count;
    },

    async recordHelpSearch(workspaceId, input) {
      const id = createId("help_search");
      const record: HelpSearchRecord = {
        id,
        workspaceId,
        query: normalizeHelpQuery(input.query),
        resultCount: Math.max(0, Math.trunc(input.resultCount)),
        createdAt: input.createdAt,
      };
      helpSearches.set(id, record);
      return copy(record);
    },

    async listHelpSearches(workspaceId, limit) {
      return [...helpSearches.values()]
        .filter((record) => record.workspaceId === workspaceId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
        .slice(0, limit)
        .map(copy);
    },

    async recordHelpFeedback(workspaceId, input) {
      const id = createId("help_feedback");
      const record: HelpFeedbackRecord = {
        id,
        workspaceId,
        articleKey: input.articleKey.trim().slice(0, 160),
        helpful: input.helpful,
        createdAt: input.createdAt,
      };
      helpFeedback.set(id, record);
      return copy(record);
    },

    async listHelpFeedback(workspaceId, limit) {
      return [...helpFeedback.values()]
        .filter((record) => record.workspaceId === workspaceId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
        .slice(0, limit)
        .map(copy);
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
      automationVersions.delete(id);
      return true;
    },

    async snapshotAutomation(workspaceId, id, snapshotBy) {
      const current = automations.get(id);
      if (!current || current.workspaceId !== workspaceId) return null;
      const existing = automationVersions.get(id) ?? [];
      const nextNumber = existing.length === 0 ? 1 : Math.max(...existing.map((snapshot) => snapshot.version)) + 1;
      const record: AutomationVersionRecord = {
        id: createId("autover"),
        automationId: id,
        workspaceId,
        version: nextNumber,
        name: current.name,
        definition: copy(current.definition),
        // Capture activation-time state so a restore is exact.
        status: current.status,
        priority: current.priority,
        ...(current.activatedAt ? { activatedAt: current.activatedAt } : {}),
        ...(current.boundMediaId ? { boundMediaId: current.boundMediaId } : {}),
        ...(current.instagramAccountId ? { instagramAccountId: current.instagramAccountId } : {}),
        ...(current.facebookPageId ? { facebookPageId: current.facebookPageId } : {}),
        ...(snapshotBy ? { snapshotBy } : {}),
        snapshotAt: now(),
      };
      automationVersions.set(id, [...existing, record]);
      return copy(record);
    },

    async listAutomationVersions(workspaceId, automationId, limit) {
      const records = automationVersions.get(automationId) ?? [];
      return copy(
        records
          .filter((record) => record.workspaceId === workspaceId)
          .sort((a, b) => b.version - a.version)
          .slice(0, limit),
      );
    },

    async getAutomationVersion(workspaceId, automationId, versionId) {
      const records = automationVersions.get(automationId) ?? [];
      const record = records.find((candidate) => candidate.id === versionId && candidate.workspaceId === workspaceId);
      return record ? copy(record) : null;
    },

    async restoreAutomationVersion(workspaceId, automationId, versionId, restoredBy) {
      const current = automations.get(automationId);
      if (!current || current.workspaceId !== workspaceId) return null;
      const records = automationVersions.get(automationId) ?? [];
      const target = records.find((record) => record.id === versionId && record.workspaceId === workspaceId);
      if (!target) return null;
      // Capture the pre-restore state so it stays in the history forever.
      await this.snapshotAutomation(workspaceId, automationId, restoredBy ?? "restore");
      // Restore the full state, not just name + definition. Without
      // status/activatedAt/boundMediaId the restored automation would
      // behave like a freshly-edited DRAFT and silently miss its
      // next-media binding (the publishedAt > activatedAt resolver would
      // pass against an old activatedAt or a missing boundMediaId).
      const restored: AutomationRecord = {
        ...current,
        name: target.name,
        definition: copy(target.definition),
        status: target.status,
        priority: target.priority,
        activatedAt: target.activatedAt,
        boundMediaId: target.boundMediaId,
        instagramAccountId: target.instagramAccountId,
        facebookPageId: target.facebookPageId,
        version: Math.max(current.version, target.definition.version) + 1,
        updatedAt: now(),
      };
      automations.set(automationId, restored);
      return copy(restored);
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
        status: input.status ?? (input.total > 0 ? "RUNNING" : "COMPLETED"),
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

    async reconcileBroadcastCounters(workspaceId, broadcastId) {
      const rows = [...outboundDeliveries.values()].filter((delivery) =>
        delivery.workspaceId === workspaceId && delivery.broadcastId === broadcastId);
      const counters = { total: rows.length, sent: 0, failed: 0, skipped: 0, pending: 0 };
      for (const delivery of rows) {
        if (delivery.state === "SENT" || delivery.resultCode === "DELIVERED") {
          counters.sent += 1;
        } else if (delivery.resultCode === "SUPPRESSED" || delivery.resultCode === "WINDOW_CLOSED") {
          counters.skipped += 1;
        } else if (delivery.state === "FAILED" && !delivery.retryable) {
          counters.failed += 1;
        } else {
          counters.pending += 1;
        }
      }
      const broadcast = broadcasts.get(broadcastId);
      if (broadcast?.workspaceId === workspaceId) {
        const completed = counters.pending === 0;
        broadcasts.set(broadcastId, {
          ...broadcast,
          total: counters.total,
          sent: counters.sent,
          failed: counters.failed,
          skipped: counters.skipped,
          status: completed ? "COMPLETED" : "RUNNING",
          completedAt: completed ? (broadcast.completedAt ?? now()) : undefined,
        });
      }
      return counters;
    },

    async getMessagingWindow(workspaceId) {
      return copy(messagingWindows.get(workspaceId) ?? null);
    },

    async setMessagingWindow(workspaceId, window) {
      if (window) messagingWindows.set(workspaceId, copy(window));
      else messagingWindows.delete(workspaceId);
    },

    async listBroadcastRecipients(workspaceId, segment, limit) {
      const cutoff = broadcastSegmentCutoff(segment, new Date());
      return [...contacts.values()]
        .filter((contact) => {
          if (contact.workspaceId !== workspaceId || contact.suppressedAt) return false;
          if (cutoff && contact.lastSeenAt >= cutoff.toISOString()) return false;
          if (segment === "captured_email") return contact.state === "CAPTURED" && Boolean(contact.email);
          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
        .slice(0, limit)
        .map((contact) => ({ igScopedUserId: contact.igScopedUserId, instagramAccountId: contact.instagramAccountId }));
    },

    async createTrackedLink(workspaceId, input) {
      const slugKey = `${workspaceId}:${input.slug}`;
      if (trackedLinkSlugs.has(slugKey)) {
        throw new Error(`Slug "${input.slug}" is already used in this workspace`);
      }
      const timestamp = now();
      const record: TrackedLinkRecord = {
        id: input.id ?? createId("tlink"),
        workspaceId,
        slug: input.slug,
        destination: input.destination,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        ...(input.utmSource ? { utmSource: input.utmSource } : {}),
        ...(input.utmMedium ? { utmMedium: input.utmMedium } : {}),
        ...(input.utmCampaign ? { utmCampaign: input.utmCampaign } : {}),
        ...(input.utmTerm ? { utmTerm: input.utmTerm } : {}),
        ...(input.utmContent ? { utmContent: input.utmContent } : {}),
        ...(input.conversionUrl ? { conversionUrl: input.conversionUrl } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
        ...(input.createdByUserId ? { createdByUserId: input.createdByUserId } : {}),
      };
      trackedLinks.set(record.id, record);
      trackedLinkSlugs.set(slugKey, record.id);
      return copy(record);
    },

    async getTrackedLinkBySlug(workspaceId, slug) {
      const id = trackedLinkSlugs.get(`${workspaceId}:${slug}`);
      if (!id) return null;
      const record = trackedLinks.get(id);
      return record && record.workspaceId === workspaceId ? copy(record) : null;
    },

    async getTrackedLinkBySlugPublic(slug) {
      for (const [linkId, record] of trackedLinks.entries()) {
        if (record.slug === slug) {
          void linkId;
          return copy(record);
        }
      }
      return null;
    },

    async listTrackedLinks(workspaceId, limit) {
      return copy(
        [...trackedLinks.values()]
          .filter((record) => record.workspaceId === workspaceId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
          .slice(0, limit),
      );
    },

    async deleteTrackedLink(workspaceId, id) {
      const record = trackedLinks.get(id);
      if (!record || record.workspaceId !== workspaceId) return false;
      trackedLinks.delete(id);
      trackedLinkSlugs.delete(`${workspaceId}:${record.slug}`);
      trackedLinkClicks.delete(id);
      return true;
    },

    async recordTrackedLinkClick(linkId, input) {
      const timestamp = now();
      const click: TrackedLinkClickRecord = {
        id: createId("tlink_click"),
        linkId,
        workspaceId: input.workspaceId,
        ipHash: input.ipHash,
        ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        ...(input.country ? { country: input.country } : {}),
        clickedAt: timestamp,
      };
      const list = trackedLinkClicks.get(linkId) ?? [];
      list.push(click);
      trackedLinkClicks.set(linkId, list);
      return copy(click);
    },

    async getTrackedLinkStats(workspaceId, id) {
      const record = trackedLinks.get(id);
      if (!record || record.workspaceId !== workspaceId) return null;
      const clicks = trackedLinkClicks.get(id) ?? [];
      const totalClicks = clicks.length;
      const uniqueIps = new Set(clicks.map((click) => click.ipHash));
      const uniqueClicks = uniqueIps.size;
      const lastClickedAt = clicks.length === 0 ? undefined : clicks.map((click) => click.clickedAt).sort().reverse()[0];
      const countryCounts = new Map<string, number>();
      for (const click of clicks) {
        if (!click.country) continue;
        countryCounts.set(click.country, (countryCounts.get(click.country) ?? 0) + 1);
      }
      const topCountries = [...countryCounts.entries()]
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      const stats: TrackedLinkStats = {
        link: copy(record),
        totalClicks,
        uniqueClicks,
        ...(lastClickedAt ? { lastClickedAt } : {}),
        topCountries,
      };
      return stats;
    },
  };
}
