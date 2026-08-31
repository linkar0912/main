import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { createId } from "@/src/lib/id";
import { prisma } from "@/src/lib/prisma";
import { EntitlementOverridesSchema, featureKeys, limitKeys } from "@/src/lib/entitlements/types";
import { AdminWorkspaceError } from "./workspace-service";

const NullableLimit = z.number().int().min(0).nullable();
export const PlanValuesSchema = z.object({
  name: z.string().trim().min(1).max(80),
  memberLimit: NullableLimit,
  automationLimit: NullableLimit,
  instagramConnectionLimit: NullableLimit,
  facebookConnectionLimit: NullableLimit,
  sequenceLimit: NullableLimit,
  monthlyBroadcastLimit: NullableLimit,
  monthlyDeliveryLimit: NullableLimit,
  sequencesEnabled: z.boolean(),
  broadcastsEnabled: z.boolean(),
  trackedLinksEnabled: z.boolean(),
  teamEnabled: z.boolean(),
  facebookEnabled: z.boolean(),
  exportsEnabled: z.boolean(),
}).strict();

const planSelect = {
  id: true, key: true, name: true, isActive: true, version: true,
  memberLimit: true, automationLimit: true, instagramConnectionLimit: true,
  facebookConnectionLimit: true, sequenceLimit: true, monthlyBroadcastLimit: true,
  monthlyDeliveryLimit: true, sequencesEnabled: true, broadcastsEnabled: true,
  trackedLinksEnabled: true, teamEnabled: true, facebookEnabled: true, exportsEnabled: true,
  createdAt: true, updatedAt: true, _count: { select: { workspaceEntitlements: true } },
} as const;

function planKey(value: string): string {
  const key = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,39}$/.test(key)) throw new AdminWorkspaceError(422, "invalid_plan_key");
  return key;
}

function serialize<T extends { createdAt: Date; updatedAt: Date; _count: { workspaceEntitlements: number } }>(plan: T) {
  const { _count, createdAt, updatedAt, ...values } = plan;
  return { ...values, workspaceCount: _count.workspaceEntitlements, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
}

export async function listAdminPlans() {
  return (await prisma.planDefinition.findMany({ orderBy: [{ isActive: "desc" }, { key: "asc" }], select: planSelect })).map(serialize);
}

export async function createAdminPlan(input: z.infer<typeof PlanValuesSchema> & { key: string }) {
  const values = PlanValuesSchema.parse(input);
  try {
    return serialize(await prisma.planDefinition.create({ data: { id: createId("plan"), key: planKey(input.key), ...values }, select: planSelect }));
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new AdminWorkspaceError(409, "plan_key_conflict");
    throw error;
  }
}

export async function updateAdminPlan(planId: string, input: z.infer<typeof PlanValuesSchema> & { version: number }) {
  const { version, ...raw } = input;
  const values = PlanValuesSchema.parse(raw);
  const changed = await prisma.planDefinition.updateMany({ where: { id: planId, version }, data: { ...values, version: { increment: 1 } } });
  if (changed.count !== 1) {
    const exists = await prisma.planDefinition.count({ where: { id: planId } });
    throw new AdminWorkspaceError(exists ? 409 : 404, exists ? "stale_version" : "plan_not_found");
  }
  return serialize(await prisma.planDefinition.findUniqueOrThrow({ where: { id: planId }, select: planSelect }));
}

export async function retireAdminPlan(planId: string, version: number) {
  const changed = await prisma.planDefinition.updateMany({ where: { id: planId, version }, data: { isActive: false, version: { increment: 1 } } });
  if (changed.count !== 1) throw new AdminWorkspaceError(409, "stale_version");
  return serialize(await prisma.planDefinition.findUniqueOrThrow({ where: { id: planId }, select: planSelect }));
}

export async function updateAdminWorkspaceEntitlement(workspaceId: string, input: { planId: string; overrides: unknown; version: number }) {
  const overrides = EntitlementOverridesSchema.parse(input.overrides);
  const plan = await prisma.planDefinition.findUnique({ where: { id: input.planId }, select: { id: true, isActive: true } });
  if (!plan) throw new AdminWorkspaceError(404, "plan_not_found");
  if (!plan.isActive) throw new AdminWorkspaceError(409, "plan_retired");
  const changed = await prisma.workspaceEntitlement.updateMany({ where: { workspaceId, version: input.version }, data: { planId: input.planId, overrides: overrides as Prisma.InputJsonValue, version: { increment: 1 } } });
  if (changed.count !== 1) {
    const exists = await prisma.workspaceEntitlement.count({ where: { workspaceId } });
    throw new AdminWorkspaceError(exists ? 409 : 404, exists ? "stale_version" : "workspace_entitlement_missing");
  }
  return loadAdminWorkspaceEntitlement(workspaceId);
}

export async function loadAdminWorkspaceEntitlement(workspaceId: string) {
  const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [record, usage] = await Promise.all([
    prisma.workspaceEntitlement.findUnique({ where: { workspaceId }, include: { plan: true } }),
    prisma.workspaceUsagePeriod.findUnique({ where: { workspaceId_periodStart: { workspaceId, periodStart } } }),
  ]);
  if (!record) throw new AdminWorkspaceError(404, "workspace_entitlement_missing");
  const overrides = EntitlementOverridesSchema.parse(record.overrides);
  const defaults = Object.fromEntries([...limitKeys, ...featureKeys].map((key) => [key, record.plan[key]]));
  return {
    workspaceId,
    plan: { id: record.plan.id, key: record.plan.key, name: record.plan.name },
    defaults,
    overrides,
    effective: { ...defaults, ...overrides },
    version: record.version,
    usage: { deliveriesReserved: usage?.deliveriesReserved ?? 0, broadcastsCreated: usage?.broadcastsCreated ?? 0, periodStart: periodStart.toISOString() },
  };
}
