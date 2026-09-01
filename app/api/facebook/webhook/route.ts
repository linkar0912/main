import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import { FacebookClient } from "@/src/lib/facebook/client";
import { normalizeFacebookWebhook } from "@/src/lib/facebook/webhooks";
import {
  processNormalizedFacebookEvent,
  RetryableFacebookError,
  isRetryableFacebookError,
} from "@/src/lib/facebook/runner";
import { enqueueFacebookEvents } from "@/src/lib/queue";
import { getRepository } from "@/src/lib/repository-provider";
import { verifyWebhookSignature } from "@/src/lib/security/signature";

export const runtime = "nodejs";

/** GET: Meta webhook verification. The same query parameters the IG route
 * accepts, but scoped to a Facebook-only verify token so the two channels
 * never share a handshake. */
export async function GET(request: Request) {
  const env = getServerEnv();
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (
    mode === "subscribe"
    && verifyToken === env.facebookVerifyToken
    && challenge
  ) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.facebookAppSecret) {
    return new Response("Facebook app secret is not configured", { status: 503 });
  }
  const rawBody = await request.text();
  // Facebook uses the same X-Hub-Signature-256 HMAC scheme as Instagram, so
  // verifyWebhookSignature is reusable across both channels.
  if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), env.facebookAppSecret)) {
    return new Response("Invalid signature", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const events = normalizeFacebookWebhook(payload);
  const enqueued = await enqueueFacebookEvents(events);
  let retryableFailure = false;
  if (events.length > 0 && enqueued === 0) {
    // No Redis queue: fall back to inline processing. Sequential keeps the
    // total wall time low and avoids blowing past Meta's per-Page rate
    // limits, which trigger redeliveries on timeout.
    const repository = getRepository();
    const client = env.facebookAppId ? new FacebookClient({ apiVersion: env.facebookApiVersion }) : undefined;
    for (const event of events) {
      try {
        await processNormalizedFacebookEvent(event, repository, {
          client,
          tokenEncryptionKey: env.facebookTokenEncryptionKey ?? env.metaTokenEncryptionKey,
        });
      } catch (error) {
        logger.error("Inline Facebook webhook event processing failed", {
          eventId: event.id,
          pageId: event.pageId,
          error: error instanceof Error ? error.message : String(error),
        });
        if (isRetryableFacebookError(error)) retryableFailure = true;
      }
    }
  }
  if (retryableFailure) {
    return Response.json({ received: false, retryable: true }, { status: 503 });
  }
  return Response.json({ received: true, events: events.length, enqueued });
}
