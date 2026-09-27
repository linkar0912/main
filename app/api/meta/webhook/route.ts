import { timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import { isRetryableAutomationError, processNormalizedEvent } from "@/src/lib/automation/runner";
import { MetaClient } from "@/src/lib/meta/client";
import { normalizeWebhook } from "@/src/lib/meta/webhooks";
import { enqueueManualReplyEchoes, enqueueWebhookEvents } from "@/src/lib/queue";
import { normalizeManualReplyEchoes, processManualReplyEcho } from "@/src/lib/automation/manual-reply";
import { getRepository } from "@/src/lib/repository-provider";
import { verifyWebhookSignature } from "@/src/lib/security/signature";

export const runtime = "nodejs";

function verifyTokenEquals(candidate: string | null, expected: string): boolean {
  if (candidate === null) return false;
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

export async function GET(request: Request) {
  const env = getServerEnv();
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && verifyTokenEquals(verifyToken, env.metaVerifyToken) && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.metaAppSecret) return new Response("Meta app secret is not configured", { status: 503 });

  const rawBody = await request.text();
  if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), env.metaAppSecret)) {
    return new Response("Invalid signature", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const events = normalizeWebhook(payload);
  const echoes = normalizeManualReplyEchoes(payload);
  const [enqueued, echoesEnqueued] = await Promise.all([
    enqueueWebhookEvents(events),
    enqueueManualReplyEchoes(echoes),
  ]);
  if (echoes.length > 0 && echoesEnqueued === 0) {
    // No queue (demo/self-hosted): judge echoes inline. There is no delayed
    // retry here, so an undecided echo simply leaves automations running.
    const repository = getRepository();
    for (const echo of echoes) {
      await processManualReplyEcho(echo, repository).catch((error) => {
        logger.warn("Inline manual-reply echo processing failed", {
          accountId: echo.accountId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }
  let retryableFailure = false;
  if (events.length > 0 && enqueued === 0) {
    // No Redis queue configured (demo/self-hosted without REDIS_URL): fall back to
    // processing inline. Process sequentially - each event can make several Meta API
    // calls, and fanning out concurrently risks blowing past Meta's webhook timeout,
    // which triggers redeliveries. The response stays minimal so internal delivery
    // details never leak to the caller.
    const repository = getRepository();
    const client = env.metaAppId ? new MetaClient({ apiVersion: env.metaApiVersion }) : undefined;
    for (const event of events) {
      try {
        await processNormalizedEvent(event, repository, {
          client,
          tokenEncryptionKey: env.metaTokenEncryptionKey,
          interactionSecret: env.metaAppSecret,
          campaignsEnabled: env.followGatedCampaignsEnabled,
          dispatchLeaseMs: env.dispatchLeaseMs,
        });
      } catch (error) {
        logger.error("Inline webhook event processing failed", {
          eventId: event.id,
          accountId: event.accountId,
          error: error instanceof Error ? error.message : String(error),
        });
        if (isRetryableAutomationError(error)) retryableFailure = true;
      }
    }
  }
  if (retryableFailure) {
    return Response.json({ received: false, retryable: true }, { status: 503 });
  }
  return Response.json({ received: true, events: events.length, enqueued });
}
