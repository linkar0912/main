import { getServerEnv } from "@/src/lib/env";
import { processNormalizedEvent } from "@/src/lib/automation/runner";
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
  const enqueued = await enqueueWebhookEvents(events);
  if (events.length > 0 && enqueued === 0) {
    const client = env.metaAppId ? new MetaClient({ apiVersion: env.metaApiVersion }) : undefined;
    const results = await Promise.all(
      events.map((event) => processNormalizedEvent(event, getRepository(), {
        client,
        tokenEncryptionKey: env.metaTokenEncryptionKey,
        interactionSecret: env.metaAppSecret,
        campaignsEnabled: env.followGatedCampaignsEnabled,
      })),
    );
    return Response.json({ received: true, events: events.length, enqueued, processed: results });
  }
  return Response.json({ received: true, events: events.length, enqueued });
}
