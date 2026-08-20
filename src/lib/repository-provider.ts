import { getServerEnv } from "./env";
import { createDemoRepository, DEMO_WORKSPACE_ID } from "./demo-data";
import { createMemoryRepository } from "./memory-repository";
import { createPrismaRepository } from "./prisma";
import type { AutomationRepository } from "./repository";

const globalForRepository = globalThis as unknown as { dmsetuRepository?: AutomationRepository };

export function getRepository(): AutomationRepository {
  if (globalForRepository.dmsetuRepository) return globalForRepository.dmsetuRepository;
  const env = getServerEnv();
  globalForRepository.dmsetuRepository = env.databaseUrl
    ? createPrismaRepository()
    : createDemoRepository() ?? createMemoryRepository();
  return globalForRepository.dmsetuRepository;
}

export function getWorkspaceId(): string {
  return DEMO_WORKSPACE_ID;
}

export function isDemoMode(): boolean {
  return !getServerEnv().databaseUrl;
}
