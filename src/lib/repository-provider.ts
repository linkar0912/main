import { getServerEnv } from "./env";
import { createDemoRepository } from "./demo-data";
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

export function isDemoMode(): boolean {
  return !getServerEnv().databaseUrl;
}
