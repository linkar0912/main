import { NextResponse } from "next/server";

import { getWebhookProcessor, WebhookError } from "@/src/lib/billing/webhook";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const eventId = request.headers.get("x-razorpay-event-id") ?? "";
  if (!signature || !eventId) return NextResponse.json({ error: "invalid_webhook_headers" }, { status: 400 });
  const rawBody = Buffer.from(await request.arrayBuffer());
  try {
    return NextResponse.json(await getWebhookProcessor().process({ eventId, rawBody, signature }));
  } catch (error) {
    if (error instanceof WebhookError) {
      const status = error.code === "invalid_webhook_signature" ? 401
        : error.code === "billing_not_configured" ? 503
          : 400;
      return NextResponse.json({ error: error.code }, { status });
    }
    return NextResponse.json({ error: "webhook_processing_failed" }, { status: 500 });
  }
}
