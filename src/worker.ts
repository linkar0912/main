import { Worker } from "bullmq";
import Redis from "ioredis";
import { getServerEnv } from "./lib/env";
import { MetaClient } from "./lib/meta/client";
import { getRepository } from "./lib/repository-provider";
import { WEBHOOK_QUEUE_NAME } from "./lib/queue";
import { processNormalizedEvent } from "./lib/automation/runner";
import type { NormalizedEvent } from "./lib/automation/types";

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
}
