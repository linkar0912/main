import type { FlowDefinition, MediaSnapshot } from "./automation/types";

export type AutomationStatus = "DRAFT" | "ACTIVE" | "PAUSED";
export type ConnectionStatus = "CONNECTED" | "DISCONNECTED" | "EXPIRED";
export type ExecutionStatus = "PROCESSING" | "SENT" | "SKIPPED" | "FAILED";
export type ExecutionDispatchStatus = "CLAIMED" | "DISPATCHING";
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
export type ContactState = "NONE" | "AWAITING_EMAIL" | "CAPTURED";

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
  countParticipantsPerDay(workspaceId: string, days: number): Promise<DailyCount[]>;
  countExecutionsSentPerDay(workspaceId: string, days: number): Promise<DailyCount[]>;
  countParticipantsByMedia(workspaceId: string): Promise<MediaPerformance[]>;
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
  createParticipant(input: CreateParticipantInput): Promise<{ created: boolean; record: AutomationParticipantRecord }>;
  getParticipant(workspaceId: string, instagramAccountId: string, id: string): Promise<AutomationParticipantRecord | null>;
  findParticipantBySource(workspaceId: string, instagramAccountId: string, sourceCommentId: string): Promise<AutomationParticipantRecord | null>;
  findPendingParticipant(igAccountId: string, igScopedUserId: string): Promise<AutomationParticipantRecord | null>;
  transitionParticipant(id: string, expectedStates: ParticipantState[], patch: ParticipantPatch): Promise<AutomationParticipantRecord | null>;
  bindNextMedia(workspaceId: string, automationId: string, mediaId: string, publishedAt: string): Promise<boolean>;
  listParticipants(workspaceId: string, automationId: string, limit: number): Promise<AutomationParticipantRecord[]>;
  listRecentParticipants(workspaceId: string, limit: number): Promise<AutomationParticipantRecord[]>;
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
  countCapturedContacts(workspaceId: string): Promise<number>;
  listCapturedContacts(workspaceId: string, limit: number): Promise<CapturedContactSummary[]>;
  deleteContactsByWorkspaceIds(workspaceIds: string[]): Promise<number>;
}
