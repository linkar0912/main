import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

const EVENT_LABELS: Record<string, string> = {
  "comment.created": "Comment",
  "message.received": "Direct message",
  "quick_reply.received": "Quick reply tap",
  "postback.received": "Button tap",
  "optin.received": "Opt-in tap",
  "referral.received": "Referral link tap",
  "story_mention.received": "Story mention",
};

// GET /api/activity - recent inbound Instagram events for this workspace,
// summarized for the activity inbox. Read-only over the persisted webhook log.
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const limitParam = Number.parseInt(params.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 100;
  const typeFilter = params.get("type") ?? undefined;

  const events = await getRepository().listRecentWebhookEvents(session.workspaceId, limit, typeFilter || undefined);
  return NextResponse.json({
    data: events.map((event) => {
      const payload = event.payload as Record<string, unknown>;
      const username = typeof payload.senderUsername === "string" ? payload.senderUsername : undefined;
      const text = typeof payload.text === "string" ? payload.text : "";
      return {
        id: event.id,
        providerEventId: event.providerEventId,
        type: event.eventType,
        label: EVENT_LABELS[event.eventType] ?? event.eventType,
        at: event.receivedAt,
        account: typeof payload.accountId === "string" ? payload.accountId : undefined,
        from: username
          ? `@${username}`
          : typeof payload.recipientId === "string"
            ? `IG user ·${payload.recipientId.slice(-6)}`
            : undefined,
        summary: text.length > 0 ? (text.length > 120 ? `${text.slice(0, 120)}…` : text) : undefined,
      };
    }),
  });
}
