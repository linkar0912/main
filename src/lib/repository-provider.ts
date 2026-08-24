import { getServerEnv } from "./env";
import { createDemoRepository } from "./demo-data";
import { createMemoryRepository } from "./memory-repository";
import { createPrismaRepository } from "./prisma";
import type { AutomationRepository } from "./repository";

const globalForRepository = globalThis as unknown as { linkarRepository?: AutomationRepository };

export function getRepository(): AutomationRepository {
  if (globalForRepository.linkarRepository) return globalForRepository.linkarRepository;
  const env = getServerEnv();
  globalForRepository.linkarRepository = env.databaseUrl
    ? createPrismaRepository()
    : createDemoRepository() ?? createMemoryRepository();
  return globalForRepository.linkarRepository;
}

export function isDemoMode(): boolean {
  return !getServerEnv().databaseUrl;
}
