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

const env = getServerEnv();

if (!env.redisUrl) {
  logger.error("ReplyConnect worker requires REDIS_URL");
  process.exitCode = 1;
} else {
  const redis = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker(
    WEBHOOK_QUEUE_NAME,
    async (job) => {
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
}