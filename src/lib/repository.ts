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
  "igScopedUserId" | "matchedKeyword" | "state" | "publicReplyStatus" | "publicReplyProviderId" | "publicReplySentAt" | "publicReplyError" | "openingStatus" | "openingProviderId" | "openingSentAt" | "openingError" | "followStatus" | "followCheckedAt" | "followCheckError" | "finalDeliveryStatus" | "finalProviderId" | "finalDeliveredAt" | "finalDeliveryError" | "messagingWindowExpiresAt" | "recheckCount"
>>;

export type RecordExecutionInput = Omit<ExecutionRecord, "id" | "createdAt" | "dispatchStatus"> & {
  dispatchStatus?: ExecutionDispatchStatus;
};
export type ClaimExecutionInput = Pick<ExecutionRecord, "workspaceId" | "automationId" | "externalEventId" | "dedupeKey">;

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

export interface AutomationRepository {
  ensureWorkspace(workspaceId: string, ownerEmail: string): Promise<void>;
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
  getExecution(workspaceId: string, dedupeKey: string): Promise<ExecutionRecord | null>;
  markExecutionDispatching(workspaceId: string, dedupeKey: string): Promise<boolean>;
  completeExecution(workspaceId: string, dedupeKey: string, result: Pick<RecordExecutionInput, "status" | "reason" | "providerMessageId" | "providerRecipientId">): Promise<void>;
  releaseExecutionClaim(workspaceId: string, dedupeKey: string): Promise<void>;
  hasExecution(workspaceId: string, dedupeKey: string): Promise<boolean>;
  createParticipant(input: CreateParticipantInput): Promise<{ created: boolean; record: AutomationParticipantRecord }>;
  getParticipant(workspaceId: string, instagramAccountId: string, id: string): Promise<AutomationParticipantRecord | null>;
  findParticipantBySource(workspaceId: string, instagramAccountId: string, sourceCommentId: string): Promise<AutomationParticipantRecord | null>;
  findPendingParticipant(igAccountId: string, igScopedUserId: string): Promise<AutomationParticipantRecord | null>;
  transitionParticipant(id: string, expectedStates: ParticipantState[], patch: ParticipantPatch): Promise<AutomationParticipantRecord | null>;
  bindNextMedia(workspaceId: string, automationId: string, mediaId: string, publishedAt: string): Promise<boolean>;
  listParticipants(workspaceId: string, automationId: string, limit: number): Promise<AutomationParticipantRecord[]>;
  expireParticipantsByInstagramAccount(igAccountId: string, reason: string): Promise<number>;
  deleteParticipantsByWorkspaceIds(workspaceIds: string[]): Promise<number>;
}
