import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import { isRetryableAutomationError, processNormalizedEvent } from "@/src/lib/automation/runner";
import { MetaClient } from "@/src/lib/meta/client";
import { normalizeWebhook } from "@/src/lib/meta/webhooks";
import { enqueueWebhookEvents } from "@/src/lib/queue";
import { getRepository } from "@/src/lib/repository-provider";
import { verifyWebhookSignature } from "@/src/lib/security/signature";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const env = getServerEnv();
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && verifyToken === env.metaVerifyToken && challenge) {
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
  const repository = getRepository();
  const runnableEvents = (await Promise.all(events.map(async (event) => {
    const mapping = await repository.findWorkspaceByInstagramAccount(event.accountId);
    if (!mapping) return null;
    return await repository.getWorkspaceStatus(mapping.workspaceId) === "ACTIVE" ? event : null;
  }))).filter((event): event is (typeof events)[number] => event !== null);
  const enqueued = await enqueueWebhookEvents(runnableEvents);
  let retryableFailure = false;
  if (runnableEvents.length > 0 && enqueued === 0) {
    // No Redis queue configured (demo/self-hosted without REDIS_URL): fall back to
    // processing inline. Process sequentially - each event can make several Meta API
    // calls, and fanning out concurrently risks blowing past Meta's webhook timeout,
    // which triggers redeliveries. The response stays minimal so internal delivery
    // details never leak to the caller.
    const client = env.metaAppId ? new MetaClient({ apiVersion: env.metaApiVersion }) : undefined;
    for (const event of runnableEvents) {
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
