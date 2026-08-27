import { getServerEnv } from "./env";
import { createDemoRepository } from "./demo-data";
import { createPrismaRepository } from "./prisma";
import type { AutomationRepository } from "./repository";

const globalForRepository = globalThis as unknown as { linkarRepository?: AutomationRepository };

export function getRepository(): AutomationRepository {
  if (globalForRepository.linkarRepository) return globalForRepository.linkarRepository;
  const env = getServerEnv();
  // createDemoRepository() always returns a value (it never throws and never
  // returns nullish), so the `??` fallback that previously sat next to it was
  // unreachable. Keep the call simple to avoid implying otherwise.
  globalForRepository.linkarRepository = env.databaseUrl
    ? createPrismaRepository()
    : createDemoRepository();
  return globalForRepository.linkarRepository;
}

export function isDemoMode(): boolean {
  return !getServerEnv().databaseUrl;
}
