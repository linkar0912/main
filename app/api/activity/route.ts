import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { instagramIdentityKey, resolveInstagramUsernames } from "@/src/lib/meta/username-resolver";
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

  const repository = getRepository();
  const events = await repository.listRecentWebhookEvents(session.workspaceId, limit, typeFilter || undefined);
  const identities = events.flatMap((event) => {
    if (event.eventType.startsWith("facebook.")) return [];
    const accountId = typeof event.payload.accountId === "string" ? event.payload.accountId : undefined;
    const recipientId = typeof event.payload.recipientId === "string" ? event.payload.recipientId : undefined;
    return accountId && recipientId ? [{ instagramAccountId: accountId, igScopedUserId: recipientId }] : [];
  });
  const contacts = await repository.getContactsByInstagramIdentities(session.workspaceId, identities);
  const contactsByIdentity = new Map(contacts.map((contact) => [instagramIdentityKey(contact), contact]));
  // Keep the inbox read path local. Provider profile enrichment belongs on
  // ingestion or an explicit refresh path, not on every page load.
  const usernames = await resolveInstagramUsernames({
    identities,
    events,
  });
  const data = events.map((event) => {
      const payload = event.payload as Record<string, unknown>;
      const channel = event.eventType.startsWith("facebook.") ? "facebook" : "instagram";
      const accountId = typeof payload.accountId === "string" ? payload.accountId : undefined;
      const senderId = typeof payload.recipientId === "string" ? payload.recipientId : undefined;
      const username = accountId && senderId
        ? usernames.get(instagramIdentityKey({ instagramAccountId: accountId, igScopedUserId: senderId }))
        : undefined;
      const senderName = typeof payload.senderName === "string" ? payload.senderName : undefined;
      const facebookSenderId = typeof payload.senderId === "string" ? payload.senderId : undefined;
      const facebookPageId = typeof payload.pageId === "string" ? payload.pageId : undefined;
      const text = typeof payload.text === "string" ? payload.text : "";
      const contact = channel === "instagram" && accountId && senderId
        ? contactsByIdentity.get(instagramIdentityKey({ instagramAccountId: accountId, igScopedUserId: senderId }))
        : undefined;
      return {
        id: event.id,
        channel,
        contactId: contact?.id,
        avatarUrl: channel === "instagram" && contact
          ? `/api/contacts/${contact.id}/avatar`
          : channel === "facebook" && facebookPageId && facebookSenderId
            ? `/api/facebook/avatar?pageId=${encodeURIComponent(facebookPageId)}&profileId=${encodeURIComponent(facebookSenderId)}`
            : undefined,
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
    });
  return NextResponse.json({ data });
}
