import "server-only";

import { getHealth, readWorkerHeartbeat, WORKER_HEARTBEAT_STALE_MS, type WorkerHeartbeat } from "@/src/lib/health";
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

async function probeWorkerUrl(): Promise<AdminProbe> {
  const workerUrl = process.env.WORKER_HEALTH_URL;
  if (!workerUrl) return { state: "degraded", detail: "Worker heartbeat endpoint not configured" };
  return bounded(async () => {
    const response = await fetch(workerUrl, { cache: "no-store", signal: AbortSignal.timeout(3_000) });
    return response.ok ? { state: "healthy" as const } : { state: "degraded" as const, detail: "Worker health returned degraded" };
  }).catch(() => ({ state: "unavailable", detail: "Worker health unavailable" }));
}

/**
 * The worker runs on its own Docker network, so the web container usually
 * cannot reach WORKER_HEALTH_URL. It writes a Redis heartbeat instead (see
 * startWorkerHeartbeat); a fresh beat is the source of truth. The URL probe is
 * only a fallback for when the heartbeat itself cannot be read.
 */
async function probeWorker(
  redisConfigured: boolean,
  read: () => Promise<WorkerHeartbeat | null>,
  now: Date,
): Promise<AdminProbe> {
  if (redisConfigured) {
    const beat = await bounded(read).then((value) => ({ read: true as const, value }), () => ({ read: false as const, value: null }));
    if (beat.read) {
      const lastSeenAt = beat.value ? new Date(beat.value.at).toISOString() : null;
      if (beat.value && now.getTime() - beat.value.at <= WORKER_HEARTBEAT_STALE_MS) {
        return { state: "healthy", release: beat.value.release, lastSeenAt };
      }
      return {
        state: "degraded",
        detail: `No heartbeat from the worker in the last ${Math.round(WORKER_HEARTBEAT_STALE_MS / 1000)} seconds`,
        release: beat.value?.release ?? null,
        lastSeenAt,
      };
    }
  }
  return probeWorkerUrl();
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
  workerHeartbeat?: () => Promise<WorkerHeartbeat | null>;
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

      const worker = await probeWorker(Boolean(env.redisUrl), dependencies.workerHeartbeat ?? readWorkerHeartbeat, now);

      const queues = queueResults.map((item, index) => item ?? { name: ADMIN_QUEUE_NAMES[index], configured: Boolean(env.redisUrl), paused: null, waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0, oldestWaitingAgeMs: null, lastFailedCode: null });
      const degraded = !health || health.status !== "ok" || database.state !== "healthy" || redis.state !== "healthy" || worker.state !== "healthy" || operational === null || queueResults.some((item) => item === null || !item.configured || item.paused !== false);
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
        operationalDataAvailable: operational !== null,
        incidents: (operational?.incidents ?? []).map((incident) => ({
          ...incident,
          firstSeenAt: incident.firstSeenAt.toISOString(),
          lastSeenAt: incident.lastSeenAt.toISOString(),
          resolvedAt: incident.resolvedAt?.toISOString() ?? null,
        })),
        configurationPresence: [
          ...[
            { requirement: "Database", present: Boolean(env.databaseUrl), fix: "Add the Postgres connection string to the web server's environment." },
            { requirement: "Redis", present: Boolean(env.redisUrl), fix: "Add the Redis connection string to the web server's environment." },
            { requirement: "Instagram app", present: Boolean(env.metaAppId && env.metaAppSecret), fix: "Set META_APP_ID and META_APP_SECRET." },
            { requirement: "Facebook app", present: Boolean(env.facebookAppId && env.facebookAppSecret), fix: "Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET." },
            { requirement: "Token encryption", present: Boolean(env.metaTokenEncryptionKey), fix: "Set META_TOKEN_ENCRYPTION_KEY to 64 hex characters." },
            { requirement: "Platform owner allowlist", present: env.platformOwnerUserIds.length > 0, fix: "Set PLATFORM_OWNER_USER_IDS to the owner's Supabase user ID." },
            { requirement: "Razorpay billing", present: billingConfigured, fix: "Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET and the six RAZORPAY_PLAN_*_ID values." },
            {
              requirement: "Owner email alerts",
              present: Boolean(env.emailApiKey && env.emailFrom && env.platformAlertEmails.length),
              fix: "Set EMAIL_API_KEY, EMAIL_FROM and PLATFORM_ALERT_EMAILS (comma-separated owner addresses), then redeploy.",
            },
          ].map(({ fix, ...item }) => (item.present ? item : { ...item, fix })),
        ],
        capabilities: { followGatedCampaigns: health?.capabilities.followGatedCampaigns ?? (env.followGatedCampaignsEnabled ? "enabled" : "disabled") },
        reconciliation: { expiredDeliveryClaims: operational?.stuckClaims ?? null },
        rateLimits: redis.state === "healthy" ? { state: "healthy" } : { state: "unavailable", detail: "Redis-backed limits unavailable" },
      };
    },
  };
}

let service: ReturnType<typeof createAdminSystemService> | undefined;
export function getAdminSystemService() {
  service ??= createAdminSystemService();
  return service;
}
