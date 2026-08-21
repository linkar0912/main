import { Worker } from "bullmq";
import Redis from "ioredis";
import { getServerEnv } from "./lib/env";
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
  console.error("ReplyConnect worker requires REDIS_URL");
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
      });
    },
    { connection: redis, concurrency: 5 },
  );

  worker.on("completed", (job) => {
    console.log(`Processed Instagram event ${job.id}`);
  });
  worker.on("failed", (job, error) => {
    console.error(`Instagram event ${job?.id ?? "unknown"} failed: ${error.message}`);
  });

  if (env.metaTokenEncryptionKey) {
    const refreshTokens = async () => {
      const result = await refreshExpiringInstagramTokens(
        getRepository(),
        env.metaTokenEncryptionKey!,
        refreshInstagramToken,
      );
      if (result.refreshed || result.failed) {
        console.log(`Instagram token refresh: ${result.refreshed} refreshed, ${result.failed} failed`);
      }
    };
    void refreshTokens().catch((error) => console.error(`Instagram token refresh failed: ${error.message}`));
    setInterval(() => void refreshTokens().catch((error) => console.error(`Instagram token refresh failed: ${error.message}`)), 24 * 60 * 60 * 1_000).unref();
  }

  const sweepParticipants = async () => {
    const result = await sweepStaleParticipants(getRepository());
    if (result.expired || result.deleted) {
      console.log(`Participant retention sweep: ${result.expired} expired, ${result.deleted} deleted`);
    }
  };
  void sweepParticipants().catch((error) => console.error(`Participant retention sweep failed: ${error.message}`));
  setInterval(() => void sweepParticipants().catch((error) => console.error(`Participant retention sweep failed: ${error.message}`)), 60 * 60 * 1_000).unref();
}
