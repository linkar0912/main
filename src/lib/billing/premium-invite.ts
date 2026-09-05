import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { createId } from "@/src/lib/id";
import { prisma } from "@/src/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1_000;

export function normalizePremiumInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function hashPremiumInviteCode(code: string): string {
  return createHash("sha256").update(normalizePremiumInviteCode(code)).digest("hex");
}

function generateCode(): string {
  const token = randomBytes(9).toString("base64url").toUpperCase();
  return `LINKAR-${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8, 12)}`;
}

export function createPremiumInviteService(client: PrismaClient = prisma, now: () => Date = () => new Date()) {
  async function redeem(input: { code: string; workspaceId: string; userId: string }) {
    const startsAt = now();
    try {
      return await client.$transaction(async (transaction) => {
        const invite = await transaction.premiumInviteCode.findUnique({
        where: { codeHash: hashPremiumInviteCode(input.code) },
        include: { redemption: { select: { id: true } } },
      });
      if (!invite) throw new Error("invite_code_invalid");
      if (invite.redemption) throw new Error("invite_code_used");
      if (invite.revokedAt) throw new Error("invite_code_revoked");
      if (invite.expiresAt && invite.expiresAt <= startsAt) throw new Error("invite_code_expired");
      const active = await transaction.premiumInviteRedemption.findFirst({
        where: { workspaceId: input.workspaceId, startsAt: { lte: startsAt }, expiresAt: { gt: startsAt } },
        select: { id: true },
      });
      if (active) throw new Error("premium_access_already_active");
      const expiresAt = new Date(startsAt.getTime() + invite.durationDays * DAY_MS);
      const redemption = await transaction.premiumInviteRedemption.create({
        data: {
          id: createId("premium"),
          codeId: invite.id,
          workspaceId: input.workspaceId,
          redeemedByUserId: input.userId,
          planId: invite.planId,
          startsAt,
          expiresAt,
        },
      });
        return { ...redemption, startsAt: startsAt.toISOString(), expiresAt: expiresAt.toISOString() };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new Error("invite_code_used");
      throw error;
    }
  }

  async function create(input: { label: string; planKey: string; createdByUserId: string; expiresAt?: Date | null }) {
    if (input.planKey === "free") {
      throw Object.assign(new Error("invite_plan_unavailable"), { status: 422, code: "invite_plan_unavailable" });
    }
    const plan = await client.planDefinition.findFirst({
      where: { key: input.planKey, isActive: true },
      select: { id: true, key: true, name: true, isActive: true },
    });
    if (!plan) {
      throw Object.assign(new Error("invite_plan_unavailable"), { status: 422, code: "invite_plan_unavailable" });
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = generateCode();
      try {
        const record = await client.premiumInviteCode.create({
          data: {
            id: createId("invite"), codeHash: hashPremiumInviteCode(code), label: input.label.trim(),
            planId: plan.id, durationDays: 30, expiresAt: input.expiresAt ?? null, createdByUserId: input.createdByUserId,
          },
        });
        return { ...record, code, plan: { key: plan.key, name: plan.name } };
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002" || attempt === 2) throw error;
      }
    }
    throw new Error("invite_code_generation_failed");
  }

  async function list() {
    const records = await client.premiumInviteCode.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, label: true, durationDays: true, expiresAt: true, revokedAt: true, createdAt: true,
        plan: { select: { key: true, name: true } },
        redemption: { select: { workspaceId: true, startsAt: true, expiresAt: true, createdAt: true } },
      },
      take: 100,
    });
    return records.map((record) => ({
      ...record,
      createdAt: record.createdAt.toISOString(),
      expiresAt: record.expiresAt?.toISOString() ?? null,
      revokedAt: record.revokedAt?.toISOString() ?? null,
      redemption: record.redemption ? {
        ...record.redemption,
        startsAt: record.redemption.startsAt.toISOString(),
        expiresAt: record.redemption.expiresAt.toISOString(),
        createdAt: record.redemption.createdAt.toISOString(),
      } : null,
    }));
  }

  async function revoke(id: string) {
    return client.premiumInviteCode.update({ where: { id }, data: { revokedAt: now() } });
  }

  return { create, list, redeem, revoke };
}

let productionService: ReturnType<typeof createPremiumInviteService> | undefined;
export function getPremiumInviteService() {
  productionService ??= createPremiumInviteService();
  return productionService;
}
