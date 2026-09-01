import type { FlowDefinition, MediaSnapshot } from "./automation/types";

export type AutomationStatus = "DRAFT" | "ACTIVE" | "PAUSED";
export type AutomationProvider = "INSTAGRAM" | "FACEBOOK";
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
  | "LEAD_WEBHOOK"
  | "FLOW_FOLLOWUP";
export type ParticipantState =
  | "COMMENT_MATCHED" | "OPENING_SENT" | "OPTED_IN" | "FOLLOW_REQUIRED"
  | "FOLLOW_VERIFIED" | "LINK_SENT" | "EXPIRED" | "FAILED";

export type AutomationRecord = {
  id: string;
  workspaceId: string;
  provider: AutomationProvider;
  /** igUserId this automation is pinned to; undefined = all connected accounts. */
  instagramAccountId?: string;
  /** Facebook Page this automation is pinned to. Mutually exclusive with
   * instagramAccountId: an automation pins to one channel or the other, never
   * both. The runner treats the two columns as separate dispatch keys. */
  facebookPageId?: string;
  name: string;
  status: AutomationStatus;
  version: number;
  definition: FlowDefinition;
  activatedAt?: string;
  boundMediaId?: string;
  /** Higher priority automations are evaluated first. Default 0. */
  priority: number;
  createdAt: string;
  updatedAt: string;
};

/** Append-only snapshot of an automation's full state. The activation-time
 * fields (status, activatedAt, boundMediaId, priority, instagramAccountId) are
 * stored so a `restoreAutomationVersion` round-trip is exact: otherwise a
 * campaign restored from a pre-edit snapshot would silently lose its
 * next-media binding and (with the publishedAt > activatedAt check) re-bind to
 * the next-published post instead of the originally targeted one. */
export type AutomationVersionRecord = {
  id: string;
  automationId: string;
  workspaceId: string;
  version: number;
  name: string;
  definition: FlowDefinition;
  status: AutomationStatus;
  priority: number;
  activatedAt?: string;
  boundMediaId?: string;
  instagramAccountId?: string;
  facebookPageId?: string;
  snapshotBy?: string;
  snapshotAt: string;
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
  /** A/B opening-message variant label recorded by campaign deliveries ("A", "B", ...). */
  variantLabel?: string;
  /** When a teammate took over the conversation; the runner skips while set. */
  pausedAt?: string;
  /** Free-form reason captured by the teammate who paused the participant. */
  pausedReason?: string;
  /** Team-member id who paused the participant. */
  pausedByUserId?: string;
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

export type FacebookPageConnectionRecord = {
  id: string;
  workspaceId: string;
  pageId: string;
  pageName: string;
  facebookUserId?: string;
  accessTokenEncrypted: string;
  tokenExpiresAt?: string;
  status: ConnectionStatus;
  connectedAt: string;
};

export type ClaimFacebookReplyRecipientInput = {
  automationId: string;
  pageId: string;
  senderId: string;
  eventId: string;
  claimedAt: string;
  claimExpiresAt: string;
};

export class FacebookPageOwnershipError extends Error {
  readonly code = "FACEBOOK_PAGE_ALREADY_CONNECTED";

  constructor() {
    super("This Facebook Page is already connected to another workspace");
    this.name = "FacebookPageOwnershipError";
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
  /** Required at API boundaries. Optional only for legacy repository callers,
   * which are deterministically treated as Instagram unless Page-pinned. */
  provider?: AutomationProvider;
  name: string;
  definition: FlowDefinition;
  instagramAccountId?: string;
  facebookPageId?: string;
  priority?: number;
};

export type UpdateAutomationInput = Partial<Pick<AutomationRecord, "name" | "status" | "definition" | "activatedAt" | "priority">> & {
  provider?: AutomationProvider;
  boundMediaId?: string | null;
  /** Pin/unpin the automation: a string pins it to that account, null unpins it. */
  instagramAccountId?: string | null;
  /** Pin/unpin the automation to a Facebook Page. Mutually exclusive with
   * instagramAccountId; setting both on the same request is rejected by the
   * route. */
  facebookPageId?: string | null;
};

export type CreateParticipantInput = Pick<
  AutomationParticipantRecord,
  "workspaceId" | "automationId" | "instagramAccountId" | "sourceCommentId" | "sourceMediaId" | "sourceMediaSnapshot"
> & Partial<Omit<AutomationParticipantRecord, "id" | "workspaceId" | "automationId" | "instagramAccountId" | "sourceCommentId" | "sourceMediaId" | "sourceMediaSnapshot" | "createdAt" | "updatedAt">>;

export type ParticipantPatch = Partial<Pick<
  AutomationParticipantRecord,
  "igScopedUserId" | "matchedKeyword" | "state" | "publicReplyStatus" | "publicReplyProviderId" | "publicReplySentAt" | "publicReplyError" | "openingStatus" | "openingProviderId" | "openingSentAt" | "openingError" | "followStatus" | "followCheckedAt" | "followCheckError" | "finalDeliveryStatus" | "finalProviderId" | "finalDeliveredAt" | "finalDeliveryError" | "deliveryClickedAt" | "messagingWindowExpiresAt" | "recheckCount" | "variantLabel"
>>;

export type DailyCount = { day: string; count: number };
export type MediaPerformance = { mediaId: string; matched: number; delivered: number; clicked: number };

/**
 * Workspace-wide registry of people who interacted with a connected Instagram account.
 * Doubles as the "have we seen this sender before" source for first_contact triggers and
 * the store for emails captured by DM email-capture flows.
 */
export type ContactState = "NONE" | "AWAITING_EMAIL" | "AWAITING_FIELD" | "CAPTURED";

/** Mini-CRM pipeline stage for a contact. */
export type LeadStatus = "NEW" | "ENGAGED" | "QUALIFIED" | "CUSTOMER";

export const LEAD_STATUSES: readonly LeadStatus[] = ["NEW", "ENGAGED", "QUALIFIED", "CUSTOMER"];

/** Score delta applied when a contact's lead status advances. */
export const LEAD_STATUS_SCORE_DELTA: Record<LeadStatus, number> = {
  NEW: 0,
  ENGAGED: 3,
  QUALIFIED: 8,
  CUSTOMER: 15,
};

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
  awaitingFields?: { id: string; question: string; kind?: "text" | "email" | "phone" | "number"; exitKeywords?: string[] }[];
  /** Set when the person opted out (STOP/unsubscribe); every automated send is skipped. */
  suppressedAt?: string;
  /** Manual + automatic labels ("email_captured", "opted_out", "clicked", ...). */
  tags: string[];
  /** Engagement score; the repository bumps it on notable interactions. */
  score: number;
  /** Mini-CRM pipeline stage. */
  leadStatus: LeadStatus;
  /** Team member currently responsible for this contact. Null = unassigned. */
  assigneeUserId?: string;
  /** Free-form internal notes. */
  notes?: string;
  /** Automation that first brought this contact into the workspace. */
  sourceAutomationId?: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

/** Labels set automatically by the engine; manual tag editing never removes them. */
export const AUTOMATIC_CONTACT_TAGS = ["email_captured", "opted_out", "clicked"] as const;

/** A branded short link, optionally with UTM params and a conversion callback. */
export type TrackedLinkRecord = {
  id: string;
  workspaceId: string;
  slug: string;
  destination: string;
  expiresAt?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  conversionUrl?: string;
  notes?: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
};

/** One click on a tracked link. The raw IP is never stored. */
export type TrackedLinkClickRecord = {
  id: string;
  linkId: string;
  workspaceId: string;
  ipHash: string;
  userAgent?: string;
  country?: string;
  clickedAt: string;
};

/** Roll-up analytics for a single tracked link. */
export type TrackedLinkStats = {
  link: TrackedLinkRecord;
  totalClicks: number;
  uniqueClicks: number;
  lastClickedAt?: string;
  topCountries: { country: string; count: number }[];
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

/** One row in a contact's interaction timeline, newest first. */
export type ContactTimelineEntry = {
  id: string;
  kind: "interaction" | "email_captured" | "opted_out" | "sequence";
  at: string;
  label: string;
  detail?: string;
};

export type HelpSearchRecord = {
  id: string;
  workspaceId: string;
  query: string;
  resultCount: number;
  createdAt: string;
};

export type HelpFeedbackRecord = {
  id: string;
  workspaceId: string;
  articleKey: string;
  helpful: boolean;
  createdAt: string;
};

/** Per-variant A/B performance for one campaign. */
export type VariantPerformance = {
  variant: string;
  participants: number;
  delivered: number;
  clicked: number;
};

/** Persisted webhook activity for the workspace inbox. */
export type WebhookEventRecord = {
  id: string;
  providerEventId: string;
  eventType: string;
  receivedAt: string;
  processedAt?: string;
  payload: Record<string, unknown>;
};

export type RecordWebhookEventInput = {
  providerEventId: string;
  eventType: string;
  receivedAt: string;
  payload: Record<string, unknown>;
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

export type BroadcastSegment =
  | "all_contacts"
  | "captured_email"
  // Win-back: contacts Meta's 24h window has almost certainly closed on. Delivery
  // attempts will mostly be skipped unless the person messaged again recently -
  // these segments exist so owners can see and prune the inactive tail.
  | "inactive_7d"
  | "inactive_30d";

/** Cutoff instant for a win-back segment: contacts last seen before it qualify. */
export function broadcastSegmentCutoff(segment: BroadcastSegment, now: Date): Date | null {
  const days = segment === "inactive_7d" ? 7 : segment === "inactive_30d" ? 30 : 0;
  return days === 0 ? null : new Date(now.getTime() - days * 24 * 60 * 60 * 1_000);
}
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

export type MemberRole = "OWNER" | "ADMIN" | "MEMBER";

export type MemberRecord = {
  id: string;
  workspaceId: string;
  email: string;
  role: MemberRole;
  userId?: string;
};

export type WorkspaceStatus = "ACTIVE" | "SUSPENDED" | "DELETION_PENDING";
export type PlatformUserStatus = "ACTIVE" | "SUSPENDED";

export type WorkspaceLifecycleChange = {
  status: WorkspaceStatus;
  reason: string;
  actorUserId: string;
  at: string;
  deletionScheduledAt?: string;
};

export type ApplicationAccessState = {
  userStatus: PlatformUserStatus;
  workspaceStatus: WorkspaceStatus;
  sessionInvalidBefore: string | null;
};

export type PlatformUserControlState = {
  status: PlatformUserStatus;
  sessionInvalidBefore: string | null;
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
  ensureWorkspace(workspaceId: string, ownerEmail: string, ownerUserId?: string): Promise<void>;
  listMembers(workspaceId: string): Promise<MemberRecord[]>;
  listWorkspaceMembershipsByUserId(userId: string): Promise<MemberRecord[]>;
  findWorkspaceIdByMemberUserId(userId: string): Promise<string | null>;
  bindMemberUserId(workspaceId: string, email: string, userId: string): Promise<boolean>;
  setWorkspaceLifecycle(workspaceId: string, change: WorkspaceLifecycleChange): Promise<boolean>;
  getWorkspaceStatus(workspaceId: string): Promise<WorkspaceStatus | null>;
  getApplicationAccessState(userId: string, workspaceId: string): Promise<ApplicationAccessState | null>;
  getPlatformUserControlState(userId: string): Promise<PlatformUserControlState>;
  getMemberRole(workspaceId: string, email: string): Promise<MemberRole | null>;
  addMember(workspaceId: string, email: string, role: MemberRole, userId?: string): Promise<{ created: boolean }>;
  updateMemberRole(workspaceId: string, email: string, role: MemberRole): Promise<boolean>;
  removeMember(workspaceId: string, email: string): Promise<boolean>;
  createInvitation(input: CreateInvitationInput): Promise<InvitationRecord>;
  listInvitations(workspaceId: string): Promise<InvitationRecord[]>;
  findInvitationByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
  acceptInvitation(id: string, now: string, userId?: string): Promise<InvitationRecord | null>;
  revokeInvitation(workspaceId: string, id: string): Promise<boolean>;
  countParticipantsByState(workspaceId: string, automationId?: string): Promise<Record<string, number>>;
  /** Returns the number of participants for one sender on a single automation (for once-per-user). */
  countParticipantsBySender(
    automationId: string,
    instagramAccountId: string,
    igScopedUserId: string,
  ): Promise<number>;
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
  /**
   * Marks the participant as paused. The runner treats any participant whose
   * `pausedAt` is non-null as "do not send automated messages". Idempotent.
   */
  pauseParticipant(id: string, reason: string, userId: string, atIso: string): Promise<AutomationParticipantRecord | null>;
  /** Clears the pause flags so the runner resumes normal delivery. */
  resumeParticipant(id: string, atIso: string): Promise<AutomationParticipantRecord | null>;
  /** Pauses every active participant for one sender (used by the handoff action). */
  pauseParticipantsBySender(
    workspaceId: string,
    instagramAccountId: string,
    igScopedUserId: string,
    reason: string,
    userId: string,
    atIso: string,
  ): Promise<number>;
  /** Returns the most recent paused participants for SLA dashboards. */
  listPausedParticipantsByWorkspace(workspaceId: string, limit: number): Promise<AutomationParticipantRecord[]>;
  /** Hot-path handoff check for one exact Instagram sender. */
  hasPausedParticipant(workspaceId: string, instagramAccountId: string, igScopedUserId: string): Promise<boolean>;
  findWorkspaceIdByMemberEmail(email: string): Promise<string | null>;
  listAutomations(workspaceId: string): Promise<AutomationRecord[]>;
  /** Active Instagram automations that are unpinned or pinned to this account. */
  listActiveAutomationsForInstagramAccount(workspaceId: string, instagramAccountId: string): Promise<AutomationRecord[]>;
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
  // Facebook Page connections (parallel to the IG block above; never the
  // two are bridged - an automation pins to either one or the other).
  listFacebookPages(workspaceId: string): Promise<FacebookPageConnectionRecord[]>;
  findWorkspaceByFacebookPage(pageId: string): Promise<{
    workspaceId: string;
    page: FacebookPageConnectionRecord;
  } | null>;
  upsertFacebookPage(input: Omit<FacebookPageConnectionRecord, "id" | "connectedAt">): Promise<FacebookPageConnectionRecord>;
  updateFacebookPageToken(id: string, accessTokenEncrypted: string, tokenExpiresAt?: string): Promise<void>;
  updateFacebookPageStatus(id: string, status: ConnectionStatus): Promise<void>;
  deleteFacebookPageByPageId(pageId: string): Promise<void>;
  deleteFacebookPagesByUserId(facebookUserId: string): Promise<void>;
  deleteFacebookPage(workspaceId: string, id: string): Promise<boolean>;
  claimFacebookReplyRecipient(input: ClaimFacebookReplyRecipientInput): Promise<boolean>;
  completeFacebookReplyRecipient(
    automationId: string,
    pageId: string,
    senderId: string,
    eventId: string,
    repliedAt: string,
  ): Promise<void>;
  releaseFacebookReplyRecipient(automationId: string, pageId: string, senderId: string, eventId: string): Promise<void>;
  beginFacebookDataDeletion(facebookUserId: string, confirmationCode: string, signedRequestHash: string): Promise<DataDeletionRequestRecord>;
  /** List the active automations pinned to a given Facebook Page. */
  listAutomationsForFacebookPage(workspaceId: string, pageId: string): Promise<AutomationRecord[]>;
  completeDataDeletion(confirmationCode: string): Promise<DataDeletionRequestRecord>;
  findDataDeletionByRequestHash(signedRequestHash: string): Promise<DataDeletionRequestRecord | null>;
  getDataDeletionRequest(confirmationCode: string): Promise<DataDeletionRequestRecord | null>;
  upsertConnection(input: Omit<InstagramConnectionRecord, "id" | "connectedAt">): Promise<InstagramConnectionRecord>;
  recordExecution(input: RecordExecutionInput): Promise<RecordExecutionResult>;
  /** Inserts execution outcomes in one duplicate-safe batch. */
  recordExecutions(inputs: RecordExecutionInput[]): Promise<number>;
  claimExecution(input: ClaimExecutionInput): Promise<boolean>;
  claimExecutionDispatch(input: ClaimExecutionDispatchInput): Promise<boolean>;
  getExecution(workspaceId: string, dedupeKey: string): Promise<ExecutionRecord | null>;
  listAutomationExecutions(workspaceId: string, automationId: string, limit: number): Promise<ExecutionRecord[]>;
  completeExecution(workspaceId: string, dedupeKey: string, result: CompleteExecutionResult): Promise<void>;
  completeOwnedExecution(workspaceId: string, dedupeKey: string, dispatchOwner: string, result: CompleteExecutionResult): Promise<boolean>;
  failAbandonedExecution(workspaceId: string, dedupeKey: string, observedAt: string, reason: string): Promise<boolean>;
  releaseExecutionClaim(workspaceId: string, dedupeKey: string): Promise<void>;
  releaseOwnedExecutionClaim(workspaceId: string, dedupeKey: string, dispatchOwner: string): Promise<boolean>;
  hasExecution(workspaceId: string, dedupeKey: string): Promise<boolean>;
  /** Lists the most recent FAILED outbound deliveries (newest first) for the dashboard. */
  listRecentOutboundFailures(workspaceId: string, limit: number): Promise<OutboundDeliveryRecord[]>;
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
  listOutboundDeliveryProblems(
    workspaceId: string,
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
  /** A/B opening-variant performance for one campaign ("A" = base text). */
  countParticipantsByVariant(workspaceId: string, automationId: string): Promise<VariantPerformance[]>;
  expireParticipantsByInstagramAccount(igAccountId: string, reason: string): Promise<number>;
  deleteParticipantsByWorkspaceIds(workspaceIds: string[]): Promise<number>;
  expireStaleParticipants(now: string, reason: string): Promise<number>;
  deleteStaleTerminalParticipants(before: string): Promise<number>;
  /** Removes the automation and (by cascade) its participants/executions. */
  deleteAutomation(workspaceId: string, id: string): Promise<boolean>;
  /**
   * Snapshots the current state of an automation into the version history.
   * Returns the new version record. No-op if the automation does not exist.
   */
  snapshotAutomation(
    workspaceId: string,
    id: string,
    snapshotBy?: string,
  ): Promise<AutomationVersionRecord | null>;
  /** Lists version snapshots, newest first. */
  listAutomationVersions(workspaceId: string, automationId: string, limit: number): Promise<AutomationVersionRecord[]>;
  /** Returns one specific version, or null if not found. */
  getAutomationVersion(workspaceId: string, automationId: string, versionId: string): Promise<AutomationVersionRecord | null>;
  /**
   * Restores the named version as the current definition. Bumps the automation
   * version counter and snapshots the current state before overwriting.
   */
  restoreAutomationVersion(
    workspaceId: string,
    automationId: string,
    versionId: string,
    restoredBy?: string,
  ): Promise<AutomationRecord | null>;
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
  countSuppressedContacts(workspaceId: string): Promise<number>;
  // Contact engagement: tags, score, and timeline.
  getContactById(workspaceId: string, contactId: string): Promise<AutomationContactRecord | null>;
  /** Replaces the manual tag set; automatic labels are preserved. */
  setContactTags(
    workspaceId: string,
    instagramAccountId: string,
    igScopedUserId: string,
    tags: string[],
  ): Promise<AutomationContactRecord | null>;
  /** Idempotently adds automatic labels; returns the updated record or null when unknown. */
  addContactTags(
    workspaceId: string,
    instagramAccountId: string,
    igScopedUserId: string,
    tags: string[],
  ): Promise<AutomationContactRecord | null>;
  /** Adds delta (clamped to >= 0, capped at 9999); returns the new score, or -1 when unknown. */
  bumpContactScore(workspaceId: string, instagramAccountId: string, igScopedUserId: string, delta: number): Promise<number>;
  /** Interaction timeline for one contact (participants + milestones), newest first. */
  getContactTimeline(workspaceId: string, contactId: string, limit: number): Promise<ContactTimelineEntry[]>;
  /**
   * Partial update of the mini-CRM fields on a contact. Any field left undefined is
   * untouched; passing `null` clears it. Unknown contact IDs return null. Status
   * changes auto-bump the engagement score using {@link LEAD_STATUS_SCORE_DELTA}.
   */
  updateContactProfile(
    workspaceId: string,
    contactId: string,
    patch: { leadStatus?: LeadStatus; assigneeUserId?: string | null; notes?: string | null; sourceAutomationId?: string | null },
  ): Promise<AutomationContactRecord | null>;
  /** Workspace-wide count of contacts grouped by lead status (for the dashboard). */
  countContactsByLeadStatus(workspaceId: string): Promise<Record<LeadStatus, number>>;
  /** Returns contacts matching an optional lead-status filter, newest first. */
  listContactsByLeadStatus(
    workspaceId: string,
    options: { leadStatus?: LeadStatus; limit: number },
  ): Promise<AutomationContactRecord[]>;
  deleteContactsByWorkspaceIds(workspaceIds: string[]): Promise<number>;
  // Tracked short links.
  createTrackedLink(
    workspaceId: string,
    input: Omit<TrackedLinkRecord, "id" | "workspaceId" | "createdAt" | "updatedAt"> & { id?: string },
  ): Promise<TrackedLinkRecord>;
  getTrackedLinkBySlug(workspaceId: string, slug: string): Promise<TrackedLinkRecord | null>;
  /**
   * Public redirect lookup: returns the link without enforcing the workspace
   * boundary, so the redirect route can serve any slug in the system.
   */
  getTrackedLinkBySlugPublic(slug: string): Promise<TrackedLinkRecord | null>;
  listTrackedLinks(workspaceId: string, limit: number): Promise<TrackedLinkRecord[]>;
  deleteTrackedLink(workspaceId: string, id: string): Promise<boolean>;
  /** Records a single click. Returns the inserted row. */
  recordTrackedLinkClick(
    linkId: string,
    input: { workspaceId: string; ipHash: string; userAgent?: string; country?: string },
  ): Promise<TrackedLinkClickRecord>;
  getTrackedLinkStats(workspaceId: string, id: string): Promise<TrackedLinkStats | null>;
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
    input: { name: string; text: string; segment: BroadcastSegment; total: number; status?: BroadcastStatus },
  ): Promise<BroadcastRecord>;
  getBroadcast(workspaceId: string, id: string): Promise<BroadcastRecord | null>;
  listBroadcasts(workspaceId: string, limit: number): Promise<BroadcastRecord[]>;
  incrementBroadcastCounters(id: string, delta: { sent?: number; failed?: number; skipped?: number }): Promise<void>;
  finalizeBroadcastIfDone(workspaceId: string, id: string): Promise<void>;
  reconcileBroadcastCounters(
    workspaceId: string,
    broadcastId: string,
  ): Promise<{ total: number; sent: number; failed: number; skipped: number; pending: number }>;
  // Workspace messaging quiet hours (null when disabled).
  getMessagingWindow(workspaceId: string): Promise<MessagingWindow | null>;
  setMessagingWindow(workspaceId: string, window: MessagingWindow | null): Promise<void>;
  /** Recipients for a broadcast segment - suppressed contacts and DM-less rows excluded. */
  listBroadcastRecipients(
    workspaceId: string,
    segment: BroadcastSegment,
    limit: number,
  ): Promise<{ igScopedUserId: string; instagramAccountId: string }[]>;
  // Webhook activity inbox (persisted summaries of every inbound event).
  /** Idempotent per (workspaceId, providerEventId); never throws on duplicates. */
  recordWebhookEvent(workspaceId: string, input: RecordWebhookEventInput): Promise<void>;
  listRecentWebhookEvents(workspaceId: string, limit: number, eventType?: string): Promise<WebhookEventRecord[]>;
  deleteOldWebhookEvents(before: string): Promise<number>;
  recordHelpSearch(
    workspaceId: string,
    input: Omit<HelpSearchRecord, "id" | "workspaceId">,
  ): Promise<HelpSearchRecord>;
  listHelpSearches(workspaceId: string, limit: number): Promise<HelpSearchRecord[]>;
  recordHelpFeedback(
    workspaceId: string,
    input: Omit<HelpFeedbackRecord, "id" | "workspaceId">,
  ): Promise<HelpFeedbackRecord>;
  listHelpFeedback(workspaceId: string, limit: number): Promise<HelpFeedbackRecord[]>;
}
