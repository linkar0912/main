import { PrismaClient } from "@prisma/client";
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
  createdAt: Date;
  updatedAt: Date;
}): AutomationRecord {
  return {
    ...record,
    definition: record.definition as AutomationRecord["definition"],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
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

export function createPrismaRepository(client = prisma): AutomationRepository {
  return {
    async listAutomations(workspaceId) {
      const records = await client.automation.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: "desc" },
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
        },
      });
      return mapAutomation(record);
    },

    async updateAutomation(workspaceId, id, patch: UpdateAutomationInput) {
      const existing = await client.automation.findFirst({ where: { workspaceId, id } });
      if (!existing) return null;
      const record = await client.automation.update({ where: { id }, data: patch });
      return mapAutomation(record);
    },

    async listConnections(workspaceId) {
      const records = await client.instagramConnection.findMany({ where: { workspaceId } });
      return records.map(mapConnection);
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

    async upsertConnection(input) {
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
        return { created: false, record: { ...existing, createdAt: existing.createdAt.toISOString() } as ExecutionRecord };
      }
      const record = await client.automationExecution.create({
        data: { id: createId("execution"), ...input },
      });
      return { created: true, record: { ...record, createdAt: record.createdAt.toISOString() } as ExecutionRecord };
    },

    async hasExecution(workspaceId, dedupeKey) {
      return Boolean(await client.automationExecution.findFirst({ where: { workspaceId, dedupeKey }, select: { id: true } }));
    },
  };
}
