import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

const EVENT_LABELS: Record<string, string> = {
  "comment.created": "Comment",
  "facebook.comment.created": "Facebook Page comment",
  "message.received": "Direct message",
  "quick_reply.received": "Quick reply tap",
  "postback.received": "Button tap",
  "optin.received": "Opt-in tap",
  "referral.received": "Referral link tap",
  "story_mention.received": "Story mention",
};

// GET /api/activity - recent inbound Instagram and Facebook events for this workspace,
// summarized for the activity inbox. Read-only over the persisted webhook log.
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const limitParam = Number.parseInt(params.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 100;
  const typeFilter = params.get("type") ?? undefined;

  const events = await getRepository().listRecentWebhookEvents(session.workspaceId, limit, typeFilter || undefined);
  const data = await Promise.all(events.map(async (event) => {
      const payload = event.payload as Record<string, unknown>;
      const channel = event.eventType.startsWith("facebook.") ? "facebook" : "instagram";
      const username = typeof payload.senderUsername === "string" ? payload.senderUsername : undefined;
      const senderName = typeof payload.senderName === "string" ? payload.senderName : undefined;
      const text = typeof payload.text === "string" ? payload.text : "";
      const accountId = typeof payload.accountId === "string" ? payload.accountId : undefined;
      const senderId = typeof payload.recipientId === "string" ? payload.recipientId : undefined;
      const contact = channel === "instagram" && accountId && senderId
        ? await getRepository().getContact(session.workspaceId, accountId, senderId)
        : null;
      return {
        id: event.id,
        channel,
        contactId: contact?.id,
        providerEventId: event.providerEventId,
        type: event.eventType,
        label: EVENT_LABELS[event.eventType] ?? event.eventType,
        at: event.receivedAt,
        account: accountId
          ? accountId
          : typeof payload.pageId === "string"
            ? payload.pageId
            : undefined,
        from: username
          ? `@${username}`
          : senderName
            ? senderName
            : typeof payload.recipientId === "string"
              ? `IG user ·${payload.recipientId.slice(-6)}`
              : undefined,
        summary: text.length > 0 ? (text.length > 120 ? `${text.slice(0, 120)}…` : text) : undefined,
      };
    }));
  return NextResponse.json({ data });
}
