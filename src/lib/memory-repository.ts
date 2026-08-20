import { createId } from "./id";
import type {
  AutomationRecord,
  AutomationRepository,
  CreateAutomationInput,
  ExecutionRecord,
  InstagramConnectionRecord,
  RecordExecutionInput,
  RecordExecutionResult,
  UpdateAutomationInput,
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

  return {
    async listAutomations(workspaceId) {
      return copy(
        [...automations.values()]
          .filter((automation) => automation.workspaceId === workspaceId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
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
        version: 1,
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
      const updated: AutomationRecord = {
        ...current,
        ...patch,
        name: patch.name?.trim() || current.name,
        definition: patch.definition ? copy(patch.definition) : current.definition,
        updatedAt: now(),
      };
      automations.set(id, updated);
      return copy(updated);
    },

    async listConnections(workspaceId) {
      return copy([...connections.values()].filter((connection) => connection.workspaceId === workspaceId));
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

    async upsertConnection(input) {
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
      const record: ExecutionRecord = { id: createId("execution"), createdAt: now(), ...input };
      executions.set(record.id, record);
      return { created: true, record: copy(record) };
    },

    async hasExecution(workspaceId, dedupeKey) {
      return [...executions.values()].some(
        (record) => record.workspaceId === workspaceId && record.dedupeKey === dedupeKey,
      );
    },
  };
}
