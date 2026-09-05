import { Worker } from "bullmq";
import Redis from "ioredis";
import { getServerEnv } from "./lib/env";
import { logger } from "./lib/logger";
import { MetaClient } from "./lib/meta/client";
import { FacebookClient } from "./lib/facebook/client";
import { getRepository } from "./lib/repository-provider";
import { WEBHOOK_QUEUE_NAME } from "./lib/queue";
import { processNormalizedEvent } from "./lib/automation/runner";
import { processNormalizedFacebookEvent } from "./lib/facebook/runner";
import type { QueuedFacebookEvent, QueuedInstagramEvent } from "./lib/queue";
import { refreshInstagramToken } from "./lib/meta/oauth";
import { refreshExpiringInstagramTokens } from "./lib/meta/token-refresh";
import { sweepStaleParticipants } from "./lib/automation/participant-retention";
import { processDueSequences } from "./lib/automation/sequence-runner";
import { processBroadcastSend, type BroadcastRunnerOptions } from "./lib/automation/broadcast-runner";
import type { BroadcastSendJob, LeadDeliveryJob } from "./lib/queue";
import { reconcileExpiredDeliveryClaims } from "./lib/automation/delivery-reconciliation";
import { processLeadDelivery } from "./lib/automation/lead-delivery";
import { processFlowFollowUp, type FlowFollowUpRunnerOptions } from "./lib/automation/followup-runner";
import type { FlowFollowUpJob } from "./lib/queue";
import { createWorkerHealthServer, workerHealthPort } from "./lib/worker-health";
import { reconcileUsageReservations } from "./lib/admin/system/usage-reconciliation";
import { processAdminDeletion } from "./lib/admin/deletion/processor";
import { createDeliveryTiming } from "./lib/automation/delivery-timing";
import { createSystemMonitor } from "./lib/admin/system/monitor";

const DELIVERY_RECONCILIATION_INTERVAL_MS = 5 * 60 * 1_000;
const SYSTEM_MONITOR_INTERVAL_MS = 5 * 60 * 1_000;

async function processTimedRealtimeJob<T>(
  jobId: string | undefined,
  channel: "instagram" | "facebook",
  ingestedAt: number,
  operation: (timing: ReturnType<typeof createDeliveryTiming>) => Promise<T>,
): Promise<T> {
  const timing = createDeliveryTiming(ingestedAt);
  timing.workerStarted();
  let outcome: "completed" | "failed" = "completed";
  let errorCode: string | undefined;
  try {
    return await operation(timing);
  } catch (error) {
    outcome = "failed";
    errorCode = error instanceof Error ? error.name : "UnknownError";
    throw error;
  } finally {
    logger.info("Realtime automation timing", {
      jobId: jobId ?? "unknown",
      channel,
      outcome,
      ...(errorCode ? { errorCode } : {}),
      ...timing.snapshot(),
    });
  }
}

const env = getServerEnv();

if (!env.redisUrl) {
  logger.error("Linkar worker requires REDIS_URL");
  process.exitCode = 1;
} else {
  // Give the container something to probe. Without this the orchestrator can
  // only see "the process is alive", not "it can still reach its dependencies".
  const healthServer = createWorkerHealthServer();
  healthServer.listen(workerHealthPort(), () =>
    logger.info("Worker health server listening", { port: workerHealthPort() }));
  healthServer.unref();

  const redis = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker(
    WEBHOOK_QUEUE_NAME,
    async (job) => {
      if (job.name === "admin-maintenance") {
        const action = (job.data as { action?: string }).action;
        if (action === "delivery_reconciliation") {
          return reconcileExpiredDeliveryClaims(getRepository(), new Date().toISOString(), 100);
        }
        if (action === "usage_reconciliation") return reconcileUsageReservations();
        throw new Error("unknown_admin_maintenance_action");
      }
      if (job.name === "admin-deletion") return processAdminDeletion((job.data as { jobId: string }).jobId);
      if (job.name === "lead-delivery") {
        const result = await processLeadDelivery(
          job.data as LeadDeliveryJob,
          getRepository(),
          { claimLeaseMs: env.dispatchLeaseMs },
        );
        if (result.status === "FAILED" && result.retryable) {
          throw new Error(result.error);
        }
        return result;
      }
      if (job.name === "broadcast-send") {
        const payload = job.data as BroadcastSendJob;
        const client = env.metaAppId ? new MetaClient({
          apiVersion: env.metaApiVersion,
          requestTimeoutMs: env.providerRequestTimeoutMs,
        }) : undefined;
        const options: BroadcastRunnerOptions = {
          client,
          tokenEncryptionKey: env.metaTokenEncryptionKey,
          finalAttempt: job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1),
          claimLeaseMs: env.dispatchLeaseMs,
        };
        return processBroadcastSend(payload, getRepository(), options);
      }
      if (job.name === "flow-followup") {
        const payload = job.data as FlowFollowUpJob;
        const client = env.metaAppId ? new MetaClient({
          apiVersion: env.metaApiVersion,
          requestTimeoutMs: env.providerRequestTimeoutMs,
        }) : undefined;
        const options: FlowFollowUpRunnerOptions = {
          client,
          tokenEncryptionKey: env.metaTokenEncryptionKey,
          finalAttempt: job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1),
          claimLeaseMs: env.dispatchLeaseMs,
        };
        return processFlowFollowUp(payload, getRepository(), options);
      }

      if (job.name === "facebook-event") {
        const { linkarIngestedAt, ...event } = job.data as QueuedFacebookEvent;
        const client = env.facebookAppId ? new FacebookClient({
          apiVersion: env.facebookApiVersion,
          requestTimeoutMs: env.providerRequestTimeoutMs,
          appSecret: env.facebookAppSecret,
        }) : undefined;
        return processTimedRealtimeJob(job.id, "facebook", linkarIngestedAt, (timing) =>
          processNormalizedFacebookEvent(event, getRepository(), {
            client,
            tokenEncryptionKey: env.facebookTokenEncryptionKey ?? env.metaTokenEncryptionKey,
            timingObserver: timing,
          }));
      }

      const { linkarIngestedAt, ...event } = job.data as QueuedInstagramEvent;
      const client = env.metaAppId ? new MetaClient({
        apiVersion: env.metaApiVersion,
        requestTimeoutMs: env.providerRequestTimeoutMs,
      }) : undefined;
      return processTimedRealtimeJob(job.id, "instagram", linkarIngestedAt, (timing) =>
        processNormalizedEvent(event, getRepository(), {
          client,
          tokenEncryptionKey: env.metaTokenEncryptionKey,
          interactionSecret: env.metaAppSecret,
          campaignsEnabled: env.followGatedCampaignsEnabled,
          finalAttempt: job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1),
          dispatchLeaseMs: env.dispatchLeaseMs,
          timingObserver: timing,
        }));
    },
    { connection: redis, concurrency: env.workerConcurrency },
  );

  worker.on("completed", (job) => {
    logger.info("Processed queue job", { jobId: job.id, jobName: job.name });
  });
  worker.on("failed", (job, error) => {
    logger.error("Queue job failed", { jobId: job?.id ?? "unknown", jobName: job?.name ?? "unknown", error: error.message });
  });

  // Drain in-flight jobs on shutdown so deploys don't kill deliveries mid-Meta-call.
  // The dispatch-lease reconciliation recovers abandoned work, but a clean close
  // avoids ambiguity windows entirely.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Worker shutting down", { signal });
    try {
      await worker.close();
      redis.disconnect();
      process.exit(0);
    } catch (error) {
      logger.error("Worker shutdown failed", { error: error instanceof Error ? error.message : String(error) });
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  if (env.metaTokenEncryptionKey) {
    const refreshTokens = async () => {
      const result = await refreshExpiringInstagramTokens(
        getRepository(),
        env.metaTokenEncryptionKey!,
        refreshInstagramToken,
      );
      if (result.refreshed || result.failed) {
        logger.info("Instagram token refresh", { refreshed: result.refreshed, failed: result.failed });
      }
    };
    void refreshTokens().catch((error) => logger.error("Instagram token refresh failed", { error: error.message }));
    setInterval(() => void refreshTokens().catch((error) => logger.error("Instagram token refresh failed", { error: error.message })), 24 * 60 * 60 * 1_000).unref();
  }

  const sweepParticipants = async () => {
    const result = await sweepStaleParticipants(getRepository());
    if (result.expired || result.deleted) {
      logger.info("Participant retention sweep", { expired: result.expired, deleted: result.deleted });
    }
  };
  void sweepParticipants().catch((error) => logger.error("Participant retention sweep failed", { error: error.message }));
  setInterval(() => void sweepParticipants().catch((error) => logger.error("Participant retention sweep failed", { error: error.message })), 60 * 60 * 1_000).unref();

  let deliveryReconciliationRunning = false;
  const runDeliveryReconciliation = async () => {
    if (deliveryReconciliationRunning) return;
    deliveryReconciliationRunning = true;
    try {
      const result = await reconcileExpiredDeliveryClaims(
        getRepository(),
        new Date().toISOString(),
        100,
      );
      if (result.unknown > 0) {
        logger.warn("Expired outbound delivery claims marked unknown", result);
      }
    } finally {
      deliveryReconciliationRunning = false;
    }
  };
  void runDeliveryReconciliation().catch((error) =>
    logger.error("Delivery reconciliation failed", { error: error.message }));
  setInterval(() => void runDeliveryReconciliation().catch((error) =>
    logger.error("Delivery reconciliation failed", { error: error.message })),
  DELIVERY_RECONCILIATION_INTERVAL_MS).unref();

  const systemMonitor = createSystemMonitor();
  const runSystemMonitor = async () => {
    const result = await systemMonitor.run();
    if (!result.skipped && (result.lifecycleChanges > 0 || result.alertsDelivered > 0)) {
      logger.info("Production system monitor", result);
    }
  };
  void runSystemMonitor().catch((error) => logger.error("Production system monitor failed", { error: error.message }));
  setInterval(() => void runSystemMonitor().catch((error) =>
    logger.error("Production system monitor failed", { error: error.message })), SYSTEM_MONITOR_INTERVAL_MS).unref();

  // Sequence scheduler: delivers drip steps that are due. Runs shortly after boot and
  // then every 15 minutes - granular enough for hour-level step delays.
  const runSequenceSweep = async () => {
    const repository = getRepository();
    const client = env.metaAppId ? new MetaClient({
      apiVersion: env.metaApiVersion,
      requestTimeoutMs: env.providerRequestTimeoutMs,
    }) : undefined;
    const result = await processDueSequences(repository, {
      client,
      tokenEncryptionKey: env.metaTokenEncryptionKey ?? undefined,
    });
    if (result.processed > 0) {
      logger.info("Sequence sweep", { ...result });
    }
  };
  setTimeout(() => void runSequenceSweep().catch((error) => logger.error("Sequence sweep failed", { error: error.message })), 45_000).unref();
  setInterval(() => void runSequenceSweep().catch((error) => logger.error("Sequence sweep failed", { error: error.message })), 15 * 60 * 1_000).unref();
}
