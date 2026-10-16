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
import { payloadTooLargeResponse, readBoundedText, RequestBodyTooLargeError } from "@/src/lib/security/request-body";

export const runtime = "nodejs";

function verifyTokenEquals(candidate: string | null, expected: string): boolean {
  if (candidate === null) return false;
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

// Meta redelivers a delivery that fails or times out. Giving up on a stalled
// Redis after 5 s, with a 503, keeps those requests from piling up here.
const ENQUEUE_DEADLINE_MS = 5_000;

async function withEnqueueDeadline<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Enqueue took longer than ${ENQUEUE_DEADLINE_MS} ms`)), ENQUEUE_DEADLINE_MS);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
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
  // Start of the reply-latency clock (see the worker's timing log).
  const receivedAt = Date.now();
  const env = getServerEnv();
  if (!env.metaAppSecret) return new Response("Meta app secret is not configured", { status: 503 });

  // Capped before signature verification: the whole body has to be buffered
  // to verify it, so an unauthenticated caller must not choose its size.
  let rawBody: string;
  try {
    rawBody = await readBoundedText(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return payloadTooLargeResponse();
    throw error;
  }
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
  let enqueued: number;
  let echoesEnqueued: number;
  try {
    [enqueued, echoesEnqueued] = await withEnqueueDeadline(Promise.all([
      enqueueWebhookEvents(events, undefined, { receivedAt }),
      enqueueManualReplyEchoes(echoes),
    ]));
  } catch (error) {
    // Ask Meta to redeliver. Job ids are deterministic, so BullMQ drops a
    // redelivered event that did reach the queue this time.
    logger.error("Webhook enqueue failed; asking Meta to redeliver", {
      channel: "instagram",
      events: events.length,
      echoes: echoes.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ received: false, retryable: true }, { status: 503 });
  }
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
          receivedAt,
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
