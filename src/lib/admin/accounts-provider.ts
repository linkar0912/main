import "server-only";

import { getServerEnv } from "@/src/lib/env";
import type { AdminAccountsRepository } from "./accounts-repository";
import { createMemoryAdminAccountsRepository } from "./memory-accounts-repository";
import { createPrismaAdminAccountsRepository } from "./prisma-accounts-repository";

let repository: AdminAccountsRepository | undefined;

export function getAdminAccountsRepository(): AdminAccountsRepository {
  repository ??= getServerEnv().databaseUrl
    ? createPrismaAdminAccountsRepository()
    : createMemoryAdminAccountsRepository();
  return repository;
}
