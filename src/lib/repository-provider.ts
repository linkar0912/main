import { getServerEnv } from "./env";
import { createDemoRepository, DEMO_WORKSPACE_ID } from "./demo-data";
import { createMemoryRepository } from "./memory-repository";
import { createPrismaRepository } from "./prisma";
import type { AutomationRepository } from "./repository";

const globalForRepository = globalThis as unknown as { replyconnectRepository?: AutomationRepository };

export function getRepository(): AutomationRepository {
  if (globalForRepository.replyconnectRepository) return globalForRepository.replyconnectRepository;
  const env = getServerEnv();
  globalForRepository.replyconnectRepository = env.databaseUrl
    ? createPrismaRepository()
    : createDemoRepository() ?? createMemoryRepository();
  return globalForRepository.replyconnectRepository;
}

export function getWorkspaceId(): string {
  return DEMO_WORKSPACE_ID;
}

export function isDemoMode(): boolean {
  return !getServerEnv().databaseUrl;
}
