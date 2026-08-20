import type { FlowDefinition } from "./automation/types";

export type AutomationStatus = "DRAFT" | "ACTIVE" | "PAUSED";
export type ConnectionStatus = "CONNECTED" | "DISCONNECTED" | "EXPIRED";
export type ExecutionStatus = "SENT" | "SKIPPED" | "FAILED";

export type AutomationRecord = {
  id: string;
  workspaceId: string;
  name: string;
  status: AutomationStatus;
  version: number;
  definition: FlowDefinition;
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
  reason?: string;
  providerMessageId?: string;
  createdAt: string;
};

export type CreateAutomationInput = {
  name: string;
  definition: FlowDefinition;
};

export type UpdateAutomationInput = Partial<Pick<AutomationRecord, "name" | "status" | "definition">>;

export type RecordExecutionInput = Omit<ExecutionRecord, "id" | "createdAt">;

export type RecordExecutionResult =
  | { created: true; record: ExecutionRecord }
  | { created: false; record: ExecutionRecord };

export type DataDeletionRequestRecord = {
  confirmationCode: string;
  instagramUserIdHash: string;
  status: "COMPLETED";
  requestedAt: string;
  completedAt: string;
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
  findWorkspaceByInstagramAccount(igUserId: string): Promise<{
    workspaceId: string;
    connection: InstagramConnectionRecord;
  } | null>;
  deleteConnectionByInstagramAccount(igUserId: string): Promise<void>;
  deleteConnection(workspaceId: string, id: string): Promise<boolean>;
  deleteInstagramData(igUserId: string, confirmationCode: string, instagramUserIdHash: string): Promise<DataDeletionRequestRecord>;
  getDataDeletionRequest(confirmationCode: string): Promise<DataDeletionRequestRecord | null>;
  upsertConnection(input: Omit<InstagramConnectionRecord, "id" | "connectedAt">): Promise<InstagramConnectionRecord>;
  recordExecution(input: RecordExecutionInput): Promise<RecordExecutionResult>;
  hasExecution(workspaceId: string, dedupeKey: string): Promise<boolean>;
}
