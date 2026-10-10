import { Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { getServerEnv } from "./lib/env";
import { logger } from "./lib/logger";
import { MetaClient } from "./lib/meta/client";
import { FacebookClient } from "./lib/facebook/client";
import { getRepository } from "./lib/repository-provider";
import { BULK_QUEUE_NAME, WEBHOOK_QUEUE_NAME } from "./lib/queue";
import { processNormalizedEvent } from "./lib/automation/runner";
import { processManualReplyEcho, type ManualReplyEcho } from "./lib/automation/manual-reply";
import { processNormalizedFacebookEvent } from "./lib/facebook/runner";
import type { QueuedFacebookEvent, QueuedInstagramEvent } from "./lib/queue";
import { refreshInstagramToken } from "./lib/meta/oauth";
import { refreshExpiringInstagramTokens } from "./lib/meta/token-refresh";
import { sweepStaleParticipants } from "./lib/automation/participant-retention";
import { processDueSequences, SEQUENCE_BATCH_SIZE } from "./lib/automation/sequence-runner";
import { processBroadcastSend, type BroadcastRunnerOptions } from "./lib/automation/broadcast-runner";
import type { BroadcastSendJob, LeadDeliveryJob } from "./lib/queue";
import { reconcileExpiredDeliveryClaims } from "./lib/automation/delivery-reconciliation";
import { processLeadDelivery } from "./lib/automation/lead-delivery";
import { processFlowFollowUp, type FlowFollowUpRunnerOptions } from "./lib/automation/followup-runner";
import type { FlowFollowUpJob } from "./lib/queue";
import { createWorkerHealthServer, workerHealthPort } from "./lib/worker-health";
import { reconcileUsageReservations } from "./lib/admin/system/usage-reconciliation";
import { sweepLapsedBillingEntitlements } from "./lib/billing/expiry-sweep";
import { processAdminDeletion } from "./lib/admin/deletion/processor";
import { createDeliveryTiming } from "./lib/automation/delivery-timing";
import { createSystemMonitor } from "./lib/admin/system/monitor";
import { reportDatabaseLatency } from "./lib/database-latency";
import { runWithSendDeferral } from "./lib/automation/job-deferral";
import { createBackgroundTasks } from "./lib/automation/background-tasks";

const DELIVERY_RECONCILIATION_INTERVAL_MS = 5 * 60 * 1_000;
const SYSTEM_MONITOR_INTERVAL_MS = 5 * 60 * 1_000;
const INBOX_RECONCILE_INTERVAL_MS = 2 * 60 * 1_000;
const INBOX_RECONCILE_WINDOW_MS = 10 * 60 * 1_000;
const SEQUENCE_SWEEP_INTERVAL_MS = 60 * 1_000;
/** Caps one tick at 20 batches (500 steps) so a huge backlog can't pin the worker. */
const SEQUENCE_MAX_ROUNDS_PER_TICK = 20;
/** How long shutdown waits for a running sweep before closing connections anyway. */
const SHUTDOWN_DRAIN_TIMEOUT_MS = 25_000;

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
  const redis = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
  const bulkRedis = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
  // Keep the legacy job handlers on the realtime queue while previously
  // enqueued bulk jobs drain during rollout. New bulk jobs use their own queue.
  const dispatchJob = async (job: Job) => {
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
            claimLeaseMs: env.dispatchLeaseMs,
          }));
      }

      if (job.name === "instagram-echo") {
        const outcome = await processManualReplyEcho(job.data as ManualReplyEcho, getRepository());
        // An automated send is still settling; look again shortly. On the last
        // attempt leave automations running - never pause on a guess.
        if (outcome === "undecided" && job.attemptsMade + 1 < Number(job.opts.attempts ?? 1)) {
          throw new Error("manual_reply_undecided");
        }
        if (outcome === "paused") {
          logger.info("Automations paused after a manual reply", { jobId: job.id ?? "unknown" });
        }
        return { outcome };
      }

      if (job.name === "instagram-event") {
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
      }

      throw new Error("unknown_job");
  };
  // Quiet hours and our own per-account send windows are waits, not failures:
  // park the job until it may send instead of spending its 2-3 attempts.
  const processJob = (job: Job, token?: string) =>
    runWithSendDeferral(job, token, () => dispatchJob(job));
  const worker = new Worker(WEBHOOK_QUEUE_NAME, processJob, {
    connection: redis,
    concurrency: env.workerConcurrency,
  });
  const bulkWorker = new Worker(BULK_QUEUE_NAME, processJob, {
    connection: bulkRedis,
    concurrency: 1,
  });
  const workers = [worker, bulkWorker];

  // Dependency probes alone can be green when BullMQ has stopped consuming.
  // Require both consumers to be running with ready Redis connections.
  const healthServer = createWorkerHealthServer({}, async () => {
    const ready = await Promise.all(workers.map(async (consumer, index) => {
      if (!consumer.isRunning() || consumer.isPaused()) return false;
      await consumer.waitUntilReady();
      return (index === 0 ? redis : bulkRedis).status === "ready";
    }));
    return ready.every(Boolean);
  });
  healthServer.listen(workerHealthPort(), () =>
    logger.info("Worker health server listening", { port: workerHealthPort() }));
  healthServer.unref();

  // One startup reading of the database round trip. A cross-region database
  // adds this latency to every query on the comment → DM path, so surface it.
  if (env.databaseUrl) {
    void import("./lib/prisma").then(({ prisma }) =>
      reportDatabaseLatency("worker", () => prisma.$queryRaw`SELECT 1`));
  }

  for (const consumer of workers) {
    consumer.on("completed", (job) => {
      logger.info("Processed queue job", { jobId: job.id, jobName: job.name });
    });
    consumer.on("failed", (job, error) => {
      logger.error("Queue job failed", { jobId: job?.id ?? "unknown", jobName: job?.name ?? "unknown", error: error instanceof Error ? error.message : String(error) });
    });
    consumer.on("error", (error) => {
      logger.error("Queue worker connection error", { error: error instanceof Error ? error.message : String(error) });
    });
  }

  const background = createBackgroundTasks();

  // Drain in-flight jobs on shutdown so deploys don't kill deliveries mid-Meta-call.
  // The dispatch-lease reconciliation recovers abandoned work, but a clean close
  // avoids ambiguity windows entirely. Periodic sweeps stop scheduling and the
  // running ones are awaited before the database pool is closed, so no sweep is
  // cut off mid-statement.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Worker shutting down", { signal });
    try {
      const [, drained] = await Promise.all([
        Promise.all(workers.map((consumer) => consumer.close())),
        background.stop(SHUTDOWN_DRAIN_TIMEOUT_MS),
      ]);
      if (!drained) logger.warn("Worker shutdown left a background sweep running", { timeoutMs: SHUTDOWN_DRAIN_TIMEOUT_MS });
      healthServer.close();
      redis.disconnect();
      bulkRedis.disconnect();
      if (env.databaseUrl) {
        const { prisma } = await import("./lib/prisma");
        await prisma.$disconnect();
      }
      process.exit(0);
    } catch (error) {
      logger.error("Worker shutdown failed", { error: error instanceof Error ? error.message : String(error) });
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  if (env.metaTokenEncryptionKey) {
    background.every("Instagram token refresh", 24 * 60 * 60 * 1_000, async () => {
      const result = await refreshExpiringInstagramTokens(
        getRepository(),
        env.metaTokenEncryptionKey!,
        refreshInstagramToken,
      );
      if (result.refreshed || result.failed) {
        logger.info("Instagram token refresh", { refreshed: result.refreshed, failed: result.failed });
      }
    });
  }

  background.every("Participant retention sweep", 60 * 60 * 1_000, async () => {
    const result = await sweepStaleParticipants(getRepository());
    if (result.expired || result.deleted) {
      logger.info("Participant retention sweep", { expired: result.expired, deleted: result.deleted });
    }
  });

  // Razorpay sends no event when a cancelled/halted subscription's paid period
  // ends, so lapsed paid plans are downgraded here (within 15 minutes).
  if (env.databaseUrl) {
    const sweepLapsedBilling = async () => {
      const result = await sweepLapsedBillingEntitlements();
      if (result.downgraded || result.conflicts) logger.info("Billing paid-through sweep", result);
    };
    void sweepLapsedBilling().catch((error) => logger.error("Billing paid-through sweep failed", { error: error instanceof Error ? error.message : String(error) }));
    setInterval(() => void sweepLapsedBilling().catch((error) => logger.error("Billing paid-through sweep failed", { error: error instanceof Error ? error.message : String(error) })), 15 * 60 * 1_000).unref();
  }

  // Closes the rare window where an inbound event and its new contact commit at
  // the same instant and neither database trigger sees the other's row.
  background.every("Inbox reconciliation", INBOX_RECONCILE_INTERVAL_MS, async () => {
    const since = new Date(Date.now() - INBOX_RECONCILE_WINDOW_MS).toISOString();
    const fixed = await getRepository().reconcileContactLastInbound(since);
    if (fixed) logger.info("Inbox ordering reconciled", { contacts: fixed });
  }, { firstRunDelayMs: INBOX_RECONCILE_INTERVAL_MS });

  background.every("Delivery reconciliation", DELIVERY_RECONCILIATION_INTERVAL_MS, async () => {
    const result = await reconcileExpiredDeliveryClaims(
      getRepository(),
      new Date().toISOString(),
      100,
    );
    if (result.unknown > 0) {
      logger.warn("Expired outbound delivery claims marked unknown", result);
    }
  });

  const systemMonitor = createSystemMonitor();
  background.every("Production system monitor", SYSTEM_MONITOR_INTERVAL_MS, async () => {
    const result = await systemMonitor.run();
    if (!result.skipped && (result.lifecycleChanges > 0 || result.alertsDelivered > 0)) {
      logger.info("Production system monitor", result);
    }
  });

  // Sequence scheduler: delivers drip steps that are due. Runs shortly after boot and
  // then every minute, so a step lands within a minute of its delay instead of up
  // to 15 minutes late. A full batch means more steps are waiting, so the sweep
  // keeps draining (bounded per tick) rather than leaving a backlog for the next.
  background.every("Sequence sweep", SEQUENCE_SWEEP_INTERVAL_MS, async () => {
    const repository = getRepository();
    const client = env.metaAppId ? new MetaClient({
      apiVersion: env.metaApiVersion,
      requestTimeoutMs: env.providerRequestTimeoutMs,
    }) : undefined;
    const totals = { processed: 0, sent: 0, failed: 0, cancelled: 0 };
    for (let round = 0; round < SEQUENCE_MAX_ROUNDS_PER_TICK && !shuttingDown; round += 1) {
      const result = await processDueSequences(repository, {
        client,
        tokenEncryptionKey: env.metaTokenEncryptionKey ?? undefined,
      });
      totals.processed += result.processed;
      totals.sent += result.sent;
      totals.failed += result.failed;
      totals.cancelled += result.cancelled;
      // Stop when the queue is drained, or when a round touched nothing
      // (every row was skipped), so a tick can never spin on the same rows.
      if (result.fetched < SEQUENCE_BATCH_SIZE || result.processed === 0) break;
    }
    if (totals.processed > 0) {
      logger.info("Sequence sweep", totals);
    }
  }, { firstRunDelayMs: 45_000 });
}
