import { Worker } from "bullmq";
import Redis from "ioredis";
import { getServerEnv } from "./lib/env";
import { logger } from "./lib/logger";
import { MetaClient } from "./lib/meta/client";
import { getRepository } from "./lib/repository-provider";
import { WEBHOOK_QUEUE_NAME } from "./lib/queue";
import { processNormalizedEvent } from "./lib/automation/runner";
import type { NormalizedEvent } from "./lib/automation/types";
import { refreshInstagramToken } from "./lib/meta/oauth";
import { refreshExpiringInstagramTokens } from "./lib/meta/token-refresh";
import { sweepStaleParticipants } from "./lib/automation/participant-retention";
import { processDueSequences } from "./lib/automation/sequence-runner";
import { processBroadcastSend, type BroadcastRunnerOptions } from "./lib/automation/broadcast-runner";
import type { BroadcastSendJob } from "./lib/queue";
import { reconcileExpiredDeliveryClaims } from "./lib/automation/delivery-reconciliation";

const DELIVERY_RECONCILIATION_INTERVAL_MS = 5 * 60 * 1_000;

const env = getServerEnv();

if (!env.redisUrl) {
  logger.error("Linkar worker requires REDIS_URL");
  process.exitCode = 1;
} else {
  const redis = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker(
    WEBHOOK_QUEUE_NAME,
    async (job) => {
      if (job.name === "broadcast-send") {
        const payload = job.data as BroadcastSendJob;
        const client = env.metaAppId ? new MetaClient({ apiVersion: env.metaApiVersion }) : undefined;
        const options: BroadcastRunnerOptions = {
          client,
          tokenEncryptionKey: env.metaTokenEncryptionKey,
          finalAttempt: job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1),
          claimLeaseMs: env.dispatchLeaseMs,
        };
        return processBroadcastSend(payload, getRepository(), options);
      }

      const event = job.data as NormalizedEvent;
      const client = env.metaAppId ? new MetaClient({ apiVersion: env.metaApiVersion }) : undefined;
      return processNormalizedEvent(event, getRepository(), {
        client,
        tokenEncryptionKey: env.metaTokenEncryptionKey,
        interactionSecret: env.metaAppSecret,
        campaignsEnabled: env.followGatedCampaignsEnabled,
        finalAttempt: job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1),
        dispatchLeaseMs: env.dispatchLeaseMs,
      });
    },
    { connection: redis, concurrency: env.workerConcurrency },
  );

  worker.on("completed", (job) => {
    logger.info("Processed Instagram event", { jobId: job.id });
  });
  worker.on("failed", (job, error) => {
    logger.error("Instagram event failed", { jobId: job?.id ?? "unknown", error: error.message });
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

  // Sequence scheduler: delivers drip steps that are due. Runs shortly after boot and
  // then every 15 minutes — granular enough for hour-level step delays.
  const runSequenceSweep = async () => {
    const repository = getRepository();
    const client = env.metaAppId ? new MetaClient({ apiVersion: env.metaApiVersion }) : undefined;
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
