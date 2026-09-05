import "server-only";

import { getHealth } from "@/src/lib/health";
import { getServerEnv } from "@/src/lib/env";
import { prisma } from "@/src/lib/prisma";
import { ADMIN_QUEUE_NAMES, getAdminQueueSnapshot } from "@/src/lib/queue";
import type { AdminIncidentSummary, AdminProbe, AdminSystemSnapshot } from "./types";

type OperationalData = {
  stuckClaims: number;
  webhookLastHour: number;
  deletionJobs: { queued: number; running: number; failed: number };
  failedBillingWebhooksLastHour: number;
  driftedSubscriptions: number;
  incidents: Array<Omit<AdminIncidentSummary, "firstSeenAt" | "lastSeenAt" | "resolvedAt"> & {
    firstSeenAt: Date;
    lastSeenAt: Date;
    resolvedAt: Date | null;
  }>;
};

async function bounded<T>(operation: () => Promise<T>, timeoutMs = 3_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("probe_timeout")), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function state(value: "ok" | "error" | "not_configured"): AdminProbe {
  if (value === "ok") return { state: "healthy" };
  if (value === "not_configured") return { state: "unavailable", detail: "Not configured" };
  return { state: "unavailable", detail: "Probe failed" };
}

async function loadOperationalData(now: Date): Promise<OperationalData> {
  const hourAgo = new Date(now.getTime() - 60 * 60_000);
  const attentionBefore = new Date(now.getTime() - 30 * 60_000);
  const [stuckClaims, webhookLastHour, deletionRows, failedBillingWebhooksLastHour, driftedSubscriptions, incidents] = await Promise.all([
    prisma.outboundDelivery.count({ where: { state: "CLAIMED", claimExpiresAt: { lt: now } } }),
    prisma.webhookEvent.count({ where: { receivedAt: { gte: hourAgo } } }),
    prisma.adminDeletionJob.groupBy({ by: ["state"], _count: { _all: true } }),
    prisma.billingWebhookEvent.count({ where: { state: "FAILED", receivedAt: { gte: hourAgo } } }),
    prisma.billingSubscription.count({
      where: {
        status: { in: ["CREATED", "AUTHENTICATED", "PENDING", "HALTED"] },
        updatedAt: { lt: attentionBefore },
      },
    }),
    prisma.adminIncident.findMany({
      where: { OR: [{ status: { in: ["OPEN", "ACKNOWLEDGED"] } }, { resolvedAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } }] },
      orderBy: [{ status: "asc" }, { severity: "desc" }, { lastSeenAt: "desc" }],
      take: 30,
      select: {
        id: true, severity: true, status: true, source: true, title: true, detail: true,
        firstSeenAt: true, lastSeenAt: true, resolvedAt: true, occurrenceCount: true,
      },
    }),
  ]);
  const deletionCounts = new Map(deletionRows.map((row) => [row.state, row._count._all]));
  return {
    stuckClaims,
    webhookLastHour,
    deletionJobs: {
      queued: deletionCounts.get("QUEUED") ?? 0,
      running: deletionCounts.get("RUNNING") ?? 0,
      failed: deletionCounts.get("FAILED") ?? 0,
    },
    failedBillingWebhooksLastHour,
    driftedSubscriptions,
    incidents,
  };
}

function razorpayConfigured(env: ReturnType<typeof getServerEnv>): boolean {
  return Boolean(
    env.razorpay.keyId && env.razorpay.keySecret && env.razorpay.webhookSecret
    && env.razorpay.planIds.creator.MONTHLY && env.razorpay.planIds.creator.ANNUAL
    && env.razorpay.planIds.growth.MONTHLY && env.razorpay.planIds.growth.ANNUAL
    && env.razorpay.planIds.agency.MONTHLY && env.razorpay.planIds.agency.ANNUAL,
  );
}

export function createAdminSystemService(dependencies: {
  health?: typeof getHealth;
  queueSnapshot?: typeof getAdminQueueSnapshot;
  operationalData?: (now: Date) => Promise<OperationalData>;
  now?: () => Date;
} = {}) {
  return {
    async snapshot(): Promise<AdminSystemSnapshot> {
      const env = getServerEnv();
      const now = dependencies.now?.() ?? new Date();
      const health = await bounded(() => (dependencies.health ?? getHealth)()).catch(() => null);
      const queueResults = await Promise.all(ADMIN_QUEUE_NAMES.map(async (name) =>
        bounded(() => (dependencies.queueSnapshot ?? getAdminQueueSnapshot)(name)).catch(() => null)));
      const database = health ? state(health.dependencies.database) : { state: "unavailable", detail: "Health probe timed out" } as const;
      const redis = health ? state(health.dependencies.redis) : { state: "unavailable", detail: "Health probe timed out" } as const;
      const operational = env.databaseUrl
        ? await bounded(() => (dependencies.operationalData ?? loadOperationalData)(now)).catch(() => null)
        : null;

      const workerUrl = process.env.WORKER_HEALTH_URL;
      let worker: AdminProbe = { state: "degraded", detail: "Worker heartbeat endpoint not configured" };
      if (workerUrl) {
        worker = await bounded(async () => {
          const response = await fetch(workerUrl, { cache: "no-store" });
          return response.ok ? { state: "healthy" as const } : { state: "degraded" as const, detail: "Worker health returned degraded" };
        }).catch(() => ({ state: "unavailable", detail: "Worker health unavailable" }));
      }

      const queues = queueResults.filter((item): item is NonNullable<typeof item> => item !== null);
      const degraded = !health || database.state !== "healthy" || redis.state !== "healthy" || worker.state !== "healthy" || queueResults.some((item) => item === null);
      const billingConfigured = razorpayConfigured(env);
      return {
        overall: degraded ? "degraded" : "healthy",
        generatedAt: now.toISOString(),
        release: health?.release ?? process.env.BUILD_COMMIT ?? null,
        web: health ? { state: health.status === "ok" ? "healthy" : "degraded" } : { state: "unavailable", detail: "Web health unavailable" },
        database,
        redis,
        worker,
        queues,
        stuckClaims: operational?.stuckClaims ?? null,
        webhookThroughput: { lastHour: operational?.webhookLastHour ?? null },
        deletionJobs: operational?.deletionJobs ?? { queued: null, running: null, failed: null },
        billing: {
          configured: billingConfigured,
          failedWebhooksLastHour: operational?.failedBillingWebhooksLastHour ?? null,
          driftedSubscriptions: operational?.driftedSubscriptions ?? null,
        },
        incidents: (operational?.incidents ?? []).map((incident) => ({
          ...incident,
          firstSeenAt: incident.firstSeenAt.toISOString(),
          lastSeenAt: incident.lastSeenAt.toISOString(),
          resolvedAt: incident.resolvedAt?.toISOString() ?? null,
        })),
        configurationPresence: [
          { requirement: "Database", present: Boolean(env.databaseUrl) },
          { requirement: "Redis", present: Boolean(env.redisUrl) },
          { requirement: "Instagram app", present: Boolean(env.metaAppId && env.metaAppSecret) },
          { requirement: "Facebook app", present: Boolean(env.facebookAppId && env.facebookAppSecret) },
          { requirement: "Token encryption", present: Boolean(env.metaTokenEncryptionKey) },
          { requirement: "Platform owner allowlist", present: env.platformOwnerUserIds.length > 0 },
          { requirement: "Razorpay billing", present: billingConfigured },
          { requirement: "Owner email alerts", present: Boolean(env.emailApiKey && env.emailFrom && env.platformAlertEmails.length) },
        ],
        capabilities: { followGatedCampaigns: health?.capabilities.followGatedCampaigns ?? (env.followGatedCampaignsEnabled ? "enabled" : "disabled") },
        reconciliation: { expiredDeliveryClaims: operational?.stuckClaims ?? null },
        rateLimits: env.redisUrl ? { state: "healthy" } : { state: "unavailable", detail: "Redis-backed limits unavailable" },
      };
    },
  };
}

let service: ReturnType<typeof createAdminSystemService> | undefined;
export function getAdminSystemService() {
  service ??= createAdminSystemService();
  return service;
}
