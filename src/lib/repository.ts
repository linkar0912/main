import type { FlowDefinition, MediaSnapshot } from "./automation/types";

export type AutomationStatus = "DRAFT" | "ACTIVE" | "PAUSED";
export type ConnectionStatus = "CONNECTED" | "DISCONNECTED" | "EXPIRED";
export type ExecutionStatus = "PROCESSING" | "SENT" | "SKIPPED" | "FAILED";
export type ExecutionDispatchStatus = "CLAIMED" | "DISPATCHING";
export type OutboundDeliveryState =
  | "PENDING"
  | "CLAIMED"
  | "SENT"
  | "FAILED"
  | "UNKNOWN";
export type OutboundDeliveryResultCode =
  | "DELIVERED"
  | "PROVIDER_REJECTED"
  | "RETRYABLE_REJECTION"
  | "SUPPRESSED"
  | "WINDOW_CLOSED"
  | "AMBIGUOUS";
export type OutboundDeliveryKind =
  | "CLASSIC_ACTION"
  | "EMAIL_CAPTURE"
  | "CAMPAIGN_ACTION"
  | "SEQUENCE_STEP"
  | "BROADCAST_RECIPIENT"
  | "LEAD_EMAIL"
  | "LEAD_WEBHOOK";
export type ParticipantState =
  | "COMMENT_MATCHED" | "OPENING_SENT" | "OPTED_IN" | "FOLLOW_REQUIRED"
  | "FOLLOW_VERIFIED" | "LINK_SENT" | "EXPIRED" | "FAILED";

export type AutomationRecord = {
  id: string;
  workspaceId: string;
  name: string;
  status: AutomationStatus;
  version: number;
  definition: FlowDefinition;
  activatedAt?: string;
  boundMediaId?: string;
  createdAt: string;
  updatedAt: string;
};

export type AutomationParticipantRecord = {
  id: string;
  workspaceId: string;
  automationId: string;
  instagramAccountId: string;
  igScopedUserId?: string;
  sourceCommentId: string;
  sourceMediaId: string;
  sourceMediaSnapshot: MediaSnapshot;
  matchedKeyword?: string;
  state: ParticipantState;
  publicReplyStatus: string;
  publicReplyProviderId?: string;
  publicReplySentAt?: string;
  publicReplyError?: string;
  openingStatus: string;
  openingProviderId?: string;
  openingSentAt?: string;
  openingError?: string;
  followStatus?: boolean;
  followCheckedAt?: string;
  followCheckError?: string;
  finalDeliveryStatus: string;
  finalProviderId?: string;
  finalDeliveredAt?: string;
  finalDeliveryError?: string;
  messagingWindowExpiresAt?: string;
  recheckCount: number;
  deliveryClickedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type InstagramConnectionRecord = {
  id: string;
  workspaceId: string;
  igUserId: string;
  username: string;
  accessTokenEncrypted: string;
  tokenExpiresAt?: string;
  status: ConnectionStatus;
  connectedAt: string;
};

export class InstagramAccountOwnershipError extends Error {
  readonly code = "INSTAGRAM_ACCOUNT_ALREADY_CONNECTED";

  constructor() {
    super("This Instagram account is already connected to another workspace");
    this.name = "InstagramAccountOwnershipError";
  }
}

export type ExecutionRecord = {
  id: string;
  workspaceId: string;
  automationId: string;
  externalEventId: string;
  dedupeKey: string;
  status: ExecutionStatus;
  dispatchStatus: ExecutionDispatchStatus;
  dispatchOwner?: string;
  dispatchStartedAt?: string;
  dispatchLeaseExpiresAt?: string;
  reason?: string;
  providerMessageId?: string;
  providerRecipientId?: string;
  createdAt: string;
};

export type OutboundDeliveryRecord = {
  id: string;
  deliveryKey: string;
  workspaceId: string;
  kind: OutboundDeliveryKind;
  recipientId?: string;
  instagramAccountId?: string;
  automationId?: string;
  participantId?: string;
  sequenceEnrollmentId?: string;
  broadcastId?: string;
  payload: Record<string, unknown>;
  state: OutboundDeliveryState;
  retryable: boolean;
  resultCode?: OutboundDeliveryResultCode;
  claimOwner?: string;
  claimExpiresAt?: string;
  attemptCount: number;
  providerMessageId?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
};

export type EnsureOutboundDeliveryInput = Omit<
  OutboundDeliveryRecord,
  | "id"
  | "state"
  | "retryable"
  | "resultCode"
  | "claimOwner"
  | "claimExpiresAt"
  | "attemptCount"
  | "providerMessageId"
  | "lastError"
  | "createdAt"
  | "updatedAt"
  | "sentAt"
>;

export type OutboundDeliveryClaimResult =
  | { claimed: true; record: OutboundDeliveryRecord }
  | { claimed: false; record: OutboundDeliveryRecord };

export type AutomationDailySendCounterRecord = {
  automationId: string;
  utcDate: string;
  reserved: number;
  updatedAt: string;
};

export type CreateAutomationInput = {
  name: string;
  definition: FlowDefinition;
};

export type UpdateAutomationInput = Partial<Pick<AutomationRecord, "name" | "status" | "definition" | "activatedAt">> & {
  boundMediaId?: string | null;
};

export type CreateParticipantInput = Pick<
  AutomationParticipantRecord,
  "workspaceId" | "automationId" | "instagramAccountId" | "sourceCommentId" | "sourceMediaId" | "sourceMediaSnapshot"
> & Partial<Omit<AutomationParticipantRecord, "id" | "workspaceId" | "automationId" | "instagramAccountId" | "sourceCommentId" | "sourceMediaId" | "sourceMediaSnapshot" | "createdAt" | "updatedAt">>;

export type ParticipantPatch = Partial<Pick<
  AutomationParticipantRecord,
  "igScopedUserId" | "matchedKeyword" | "state" | "publicReplyStatus" | "publicReplyProviderId" | "publicReplySentAt" | "publicReplyError" | "openingStatus" | "openingProviderId" | "openingSentAt" | "openingError" | "followStatus" | "followCheckedAt" | "followCheckError" | "finalDeliveryStatus" | "finalProviderId" | "finalDeliveredAt" | "finalDeliveryError" | "deliveryClickedAt" | "messagingWindowExpiresAt" | "recheckCount"
>>;

export type DailyCount = { day: string; count: number };
export type MediaPerformance = { mediaId: string; matched: number; delivered: number; clicked: number };

/**
 * Workspace-wide registry of people who interacted with a connected Instagram account.
 * Doubles as the "have we seen this sender before" source for first_contact triggers and
 * the store for emails captured by DM email-capture flows.
 */
export type ContactState = "NONE" | "AWAITING_EMAIL" | "AWAITING_FIELD" | "CAPTURED";

export type AutomationContactRecord = {
  id: string;
  workspaceId: string;
  instagramAccountId: string;
  igScopedUserId: string;
  email?: string;
  state: ContactState;
  /** Automation that asked for the email while state is AWAITING_EMAIL. */
  awaitingAutomationId?: string;
  awaitingSince?: string;
  /** Invalid email replies received while awaiting (retry budget). */
  attempts: number;
  /** Answers collected by conversational field questions, keyed by field id. */
  fields?: Record<string, string>;
  /** Remaining questions while state is AWAITING_FIELD. */
  awaitingFields?: { id: string; question: string }[];
  /** Set when the person opted out (STOP/unsubscribe); every automated send is skipped. */
  suppressedAt?: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

/** Marks the sender as seen; `created` is true when this was their first interaction. */
export type TouchContactResult = { created: boolean; record: AutomationContactRecord };

export type CapturedContactSummary = {
  id: string;
  email: string;
  instagramAccountId: string;
  automationId?: string;
  capturedAt: string;
};

export type SequenceStep = {
  id: string;
  /** Hours to wait after the previous step (0 = immediately on enrollment). */
  delayHours: number;
  text: string;
};

export type SequenceStatus = "DRAFT" | "ACTIVE" | "PAUSED";

export type AutomationSequenceRecord = {
  id: string;
  workspaceId: string;
  name: string;
  status: SequenceStatus;
  steps: SequenceStep[];
  /** When set, contacts captured by this automation enroll automatically. */
  sourceAutomationId?: string;
  createdAt: string;
  updatedAt: string;
};

export type AutomationSequencePatch = Partial<Pick<AutomationSequenceRecord, "name" | "status" | "steps">> & {
  sourceAutomationId?: string | null;
};

export type EnrollmentState = "ACTIVE" | "COMPLETED" | "CANCELLED";

export type SequenceEnrollmentRecord = {
  id: string;
  workspaceId: string;
  sequenceId: string;
  contactId: string;
  currentStepIndex: number;
  nextSendAt?: string;
  state: EnrollmentState;
  enrolledAt: string;
  updatedAt: string;
};

export type SequenceEnrollmentCount = { sequenceId: string; count: number };

/** One scheduler-ready send: enrollment plus everything needed to deliver it. */
export type DueSequenceSend = {
  enrollment: SequenceEnrollmentRecord;
  sequence: AutomationSequenceRecord;
  contact: AutomationContactRecord;
};

/** Optional do-not-disturb window, evaluated in the workspace timezone. */
export type MessagingWindow = { startHour: number; endHour: number; timezone: string };

export type BroadcastSegment = "all_contacts" | "captured_email";
export type BroadcastStatus = "PENDING" | "RUNNING" | "COMPLETED";

export type BroadcastRecord = {
  id: string;
  workspaceId: string;
  name: string;
  text: string;
  segment: BroadcastSegment;
  status: BroadcastStatus;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  createdAt: string;
  completedAt?: string;
};

export type RecordExecutionInput = Omit<ExecutionRecord, "id" | "createdAt" | "dispatchStatus"> & {
  dispatchStatus?: ExecutionDispatchStatus;
};
export type ClaimExecutionInput = Pick<ExecutionRecord, "workspaceId" | "automationId" | "externalEventId" | "dedupeKey">;
export type ClaimExecutionDispatchInput = ClaimExecutionInput & Required<Pick<
  ExecutionRecord,
  "dispatchOwner" | "dispatchStartedAt" | "dispatchLeaseExpiresAt"
>>;
export type CompleteExecutionResult = Pick<
  RecordExecutionInput,
  "status" | "reason" | "providerMessageId" | "providerRecipientId"
>;

export type RecordExecutionResult =
  | { created: true; record: ExecutionRecord }
  | { created: false; record: ExecutionRecord };

export type DataDeletionRequestRecord = {
  confirmationCode: string;
  signedRequestHash: string;
  status: "PENDING" | "COMPLETED";
  requestedAt: string;
  completedAt?: string;
};

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt?: string;
  tokenVersion: number;
  createdAt: string;
};

export type CreateUserInput = {
  email: string;
  passwordHash: string;
};

export type AuthTokenType = "PASSWORD_RESET" | "EMAIL_VERIFY";

export type AuthTokenRecord = {
  id: string;
  userId: string;
  type: AuthTokenType;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
};

export type CreateAuthTokenInput = Pick<AuthTokenRecord, "userId" | "type" | "tokenHash" | "expiresAt">;

export type MemberRole = "OWNER" | "ADMIN" | "MEMBER";

export type MemberRecord = {
  id: string;
  workspaceId: string;
  email: string;
  role: MemberRole;
};

export type InvitationRecord = {
  id: string;
  workspaceId: string;
  email: string;
  role: Exclude<MemberRole, "OWNER">;
  tokenHash: string;
  invitedByUserId: string;
  expiresAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  createdAt: string;
};

export type CreateInvitationInput = Omit<InvitationRecord, "id" | "acceptedAt" | "revokedAt" | "createdAt">;

export type ParticipantFunnelCounts = {
  commented: number;
  openingSent: number;
  optedIn: number;
  followed: number;
  linkSent: number;
};

export interface AutomationRepository {
  ensureWorkspace(workspaceId: string, ownerEmail: string): Promise<void>;
  createUser(input: CreateUserInput): Promise<{ created: boolean; record: UserRecord }>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  markUserEmailVerified(userId: string): Promise<void>;
  getUserTokenVersion(userId: string): Promise<number | null>;
  bumpUserTokenVersion(userId: string): Promise<number>;
  createAuthToken(input: CreateAuthTokenInput): Promise<AuthTokenRecord>;
  // Single-use consumption: returns null when unknown, wrong type, expired, or already used.
  consumeAuthToken(tokenHash: string, type: AuthTokenType, now: string): Promise<AuthTokenRecord | null>;
  isSessionRevoked(sessionId: string): Promise<boolean>;
  revokeSession(sessionId: string, userId: string, expiresAt: string): Promise<void>;
  listMembers(workspaceId: string): Promise<MemberRecord[]>;
  getMemberRole(workspaceId: string, email: string): Promise<MemberRole | null>;
  addMember(workspaceId: string, email: string, role: MemberRole): Promise<{ created: boolean }>;
  updateMemberRole(workspaceId: string, email: string, role: MemberRole): Promise<boolean>;
  removeMember(workspaceId: string, email: string): Promise<boolean>;
  createInvitation(input: CreateInvitationInput): Promise<InvitationRecord>;
  listInvitations(workspaceId: string): Promise<InvitationRecord[]>;
  findInvitationByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
  acceptInvitation(id: string, now: string): Promise<InvitationRecord | null>;
  revokeInvitation(workspaceId: string, id: string): Promise<boolean>;
  countParticipantsByState(workspaceId: string, automationId?: string): Promise<Record<string, number>>;
  countExecutionsSentSince(automationId: string, sinceIso: string): Promise<number>;
  countParticipantsCreatedSince(workspaceId: string, sinceIso: string): Promise<number>;
  // Analytics helpers (UTC day buckets over the trailing window).
  countParticipantsPerDay(workspaceId: string, days: number, automationId?: string): Promise<DailyCount[]>;
  /** Per-automation execution outcome tallies since the given instant (funnels). */
  countExecutionsByStatusPerAutomation(
    workspaceId: string,
    sinceIso: string,
  ): Promise<{ automationId: string; sent: number; failed: number; skipped: number }[]>;
  countExecutionsSentPerDay(workspaceId: string, days: number, automationId?: string): Promise<DailyCount[]>;
  countParticipantsByMedia(workspaceId: string, automationId?: string): Promise<MediaPerformance[]>;
  countParticipantFunnel(workspaceId: string, automationId: string): Promise<ParticipantFunnelCounts>;
  // Click tracking for delivered links.
  getParticipantById(id: string): Promise<AutomationParticipantRecord | null>;
  markDeliveryClicked(id: string, atIso: string): Promise<boolean>;
  findWorkspaceIdByMemberEmail(email: string): Promise<string | null>;
  listAutomations(workspaceId: string): Promise<AutomationRecord[]>;
  getAutomation(workspaceId: string, id: string): Promise<AutomationRecord | null>;
  createAutomation(workspaceId: string, input: CreateAutomationInput): Promise<AutomationRecord>;
  updateAutomation(
    workspaceId: string,
    id: string,
    patch: UpdateAutomationInput,
  ): Promise<AutomationRecord | null>;
  listConnections(workspaceId: string): Promise<InstagramConnectionRecord[]>;
  listConnectionsExpiringBefore(before: string): Promise<InstagramConnectionRecord[]>;
  updateConnectionToken(id: string, accessTokenEncrypted: string, tokenExpiresAt?: string): Promise<void>;
  updateConnectionStatus(id: string, status: ConnectionStatus): Promise<void>;
  findWorkspaceByInstagramAccount(igUserId: string): Promise<{
    workspaceId: string;
    connection: InstagramConnectionRecord;
  } | null>;
  deleteConnectionByInstagramAccount(igUserId: string): Promise<void>;
  deleteConnection(workspaceId: string, id: string): Promise<boolean>;
  beginInstagramDataDeletion(igUserId: string, confirmationCode: string, signedRequestHash: string): Promise<DataDeletionRequestRecord>;
  completeDataDeletion(confirmationCode: string): Promise<DataDeletionRequestRecord>;
  findDataDeletionByRequestHash(signedRequestHash: string): Promise<DataDeletionRequestRecord | null>;
  getDataDeletionRequest(confirmationCode: string): Promise<DataDeletionRequestRecord | null>;
  upsertConnection(input: Omit<InstagramConnectionRecord, "id" | "connectedAt">): Promise<InstagramConnectionRecord>;
  recordExecution(input: RecordExecutionInput): Promise<RecordExecutionResult>;
  claimExecution(input: ClaimExecutionInput): Promise<boolean>;
  claimExecutionDispatch(input: ClaimExecutionDispatchInput): Promise<boolean>;
  getExecution(workspaceId: string, dedupeKey: string): Promise<ExecutionRecord | null>;
  completeExecution(workspaceId: string, dedupeKey: string, result: CompleteExecutionResult): Promise<void>;
  completeOwnedExecution(workspaceId: string, dedupeKey: string, dispatchOwner: string, result: CompleteExecutionResult): Promise<boolean>;
  failAbandonedExecution(workspaceId: string, dedupeKey: string, observedAt: string, reason: string): Promise<boolean>;
  releaseExecutionClaim(workspaceId: string, dedupeKey: string): Promise<void>;
  releaseOwnedExecutionClaim(workspaceId: string, dedupeKey: string, dispatchOwner: string): Promise<boolean>;
  hasExecution(workspaceId: string, dedupeKey: string): Promise<boolean>;
  ensureOutboundDelivery(input: EnsureOutboundDeliveryInput): Promise<OutboundDeliveryRecord>;
  getOutboundDelivery(deliveryKey: string): Promise<OutboundDeliveryRecord | null>;
  claimOutboundDelivery(
    deliveryKey: string,
    owner: string,
    leaseUntil: string,
  ): Promise<OutboundDeliveryClaimResult>;
  completeOutboundDelivery(
    deliveryKey: string,
    owner: string,
    providerMessageId: string | undefined,
    sentAt: string,
  ): Promise<boolean>;
  failOutboundDelivery(
    deliveryKey: string,
    owner: string,
    error: string,
    retryable: boolean,
    resultCode:
      | "PROVIDER_REJECTED"
      | "RETRYABLE_REJECTION"
      | "SUPPRESSED"
      | "WINDOW_CLOSED",
  ): Promise<boolean>;
  markOutboundDeliveryUnknown(
    deliveryKey: string,
    owner: string | undefined,
    error: string,
  ): Promise<boolean>;
  listExpiredDeliveryClaims(
    nowIso: string,
    limit: number,
  ): Promise<OutboundDeliveryRecord[]>;
  claimAutomationSendSlots(
    automationId: string,
    utcDate: string,
    amount: number,
    limit: number,
  ): Promise<boolean>;
  releaseAutomationSendSlots(
    automationId: string,
    utcDate: string,
    amount: number,
  ): Promise<void>;
  createParticipant(input: CreateParticipantInput): Promise<{ created: boolean; record: AutomationParticipantRecord }>;
  getParticipant(workspaceId: string, instagramAccountId: string, id: string): Promise<AutomationParticipantRecord | null>;
  findParticipantBySource(workspaceId: string, instagramAccountId: string, sourceCommentId: string): Promise<AutomationParticipantRecord | null>;
  findPendingParticipant(igAccountId: string, igScopedUserId: string): Promise<AutomationParticipantRecord | null>;
  transitionParticipant(id: string, expectedStates: ParticipantState[], patch: ParticipantPatch): Promise<AutomationParticipantRecord | null>;
  bindNextMedia(workspaceId: string, automationId: string, mediaId: string, publishedAt: string): Promise<boolean>;
  listParticipants(workspaceId: string, automationId: string, limit: number): Promise<AutomationParticipantRecord[]>;
  listRecentParticipants(workspaceId: string, limit: number, automationId?: string): Promise<AutomationParticipantRecord[]>;
  expireParticipantsByInstagramAccount(igAccountId: string, reason: string): Promise<number>;
  deleteParticipantsByWorkspaceIds(workspaceIds: string[]): Promise<number>;
  expireStaleParticipants(now: string, reason: string): Promise<number>;
  deleteStaleTerminalParticipants(before: string): Promise<number>;
  /** Removes the automation and (by cascade) its participants/executions. */
  deleteAutomation(workspaceId: string, id: string): Promise<boolean>;
  // Contact registry (first-contact detection + DM email capture).
  touchContact(
    workspaceId: string,
    instagramAccountId: string,
    igScopedUserId: string,
    seenAt: string,
  ): Promise<TouchContactResult>;
  getContact(workspaceId: string, instagramAccountId: string, igScopedUserId: string): Promise<AutomationContactRecord | null>;
  setContactAwaitingEmail(
    workspaceId: string,
    instagramAccountId: string,
    igScopedUserId: string,
    automationId: string,
    atIso: string,
  ): Promise<AutomationContactRecord>;
  captureContactEmail(
    workspaceId: string,
    instagramAccountId: string,
    igScopedUserId: string,
    email: string,
    atIso: string,
  ): Promise<AutomationContactRecord>;
  /** Records one invalid reply; returns the updated attempts count. */
  bumpContactEmailAttempt(workspaceId: string, instagramAccountId: string, igScopedUserId: string): Promise<number>;
  clearContactAwaitingEmail(workspaceId: string, instagramAccountId: string, igScopedUserId: string): Promise<void>;
  /** Marks the person as opted out; idempotent. All automated sends skip them afterwards. */
  suppressContact(workspaceId: string, instagramAccountId: string, igScopedUserId: string, atIso: string): Promise<AutomationContactRecord>;
  /** Starts the conversational field queue after the email is stored. */
  beginContactFieldCollection(
    workspaceId: string,
    instagramAccountId: string,
    igScopedUserId: string,
    remainingFields: { id: string; question: string }[],
    automationId: string,
    atIso: string,
  ): Promise<AutomationContactRecord>;
  /** Stores one answer and advances the queue; completes collection on the last field. */
  recordContactFieldAnswer(
    workspaceId: string,
    instagramAccountId: string,
    igScopedUserId: string,
    fieldId: string,
    answer: string,
    remainingAfter: { id: string; question: string }[],
    atIso: string,
  ): Promise<AutomationContactRecord>;
  countCapturedContacts(workspaceId: string): Promise<number>;
  listCapturedContacts(workspaceId: string, limit: number): Promise<CapturedContactSummary[]>;
  deleteContactsByWorkspaceIds(workspaceIds: string[]): Promise<number>;
  // Sequences (timed drip campaigns over DM).
  createSequence(
    workspaceId: string,
    input: { name: string; status: SequenceStatus; steps: SequenceStep[]; sourceAutomationId?: string },
  ): Promise<AutomationSequenceRecord>;
  getSequence(workspaceId: string, id: string): Promise<AutomationSequenceRecord | null>;
  updateSequence(
    workspaceId: string,
    id: string,
    patch: AutomationSequencePatch,
  ): Promise<AutomationSequenceRecord | null>;
  deleteSequence(workspaceId: string, id: string): Promise<boolean>;
  listSequences(workspaceId: string): Promise<AutomationSequenceRecord[]>;
  listActiveSequencesForSource(workspaceId: string, sourceAutomationId: string): Promise<AutomationSequenceRecord[]>;
  countEnrollmentsBySequence(workspaceId: string): Promise<SequenceEnrollmentCount[]>;
  /** Idempotent per (sequenceId, contactId); schedules step 0 at now + firstDelayHours. */
  enrollContactInSequence(
    workspaceId: string,
    sequenceId: string,
    contactId: string,
    firstDelayHours: number,
    nowIso: string,
  ): Promise<{ created: boolean }>;
  listDueSequenceSends(nowIso: string, limit: number): Promise<DueSequenceSend[]>;
  /** Advances one step; nextIndex beyond the last step completes the enrollment. */
  advanceSequenceEnrollment(id: string, nextIndex: number, nextSendAtIso: string | null): Promise<void>;
  cancelEnrollmentsForContact(contactId: string): Promise<number>;
  // Broadcasts (one-off DM blasts to a segment).
  createBroadcast(
    workspaceId: string,
    input: { name: string; text: string; segment: BroadcastSegment; total: number },
  ): Promise<BroadcastRecord>;
  getBroadcast(workspaceId: string, id: string): Promise<BroadcastRecord | null>;
  listBroadcasts(workspaceId: string, limit: number): Promise<BroadcastRecord[]>;
  incrementBroadcastCounters(id: string, delta: { sent?: number; failed?: number; skipped?: number }): Promise<void>;
  finalizeBroadcastIfDone(workspaceId: string, id: string): Promise<void>;
  // Workspace messaging quiet hours (null when disabled).
  getMessagingWindow(workspaceId: string): Promise<MessagingWindow | null>;
  setMessagingWindow(workspaceId: string, window: MessagingWindow | null): Promise<void>;
  /** Recipients for a broadcast segment — suppressed contacts and DM-less rows excluded. */
  listBroadcastRecipients(
    workspaceId: string,
    segment: BroadcastSegment,
    limit: number,
  ): Promise<{ igScopedUserId: string; instagramAccountId: string }[]>;
}
