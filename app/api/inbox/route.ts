import { NextResponse } from "next/server";
import { z } from "zod";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { isWithinMessagingWindow } from "@/src/lib/messaging-window";
import { MetaClient } from "@/src/lib/meta/client";
import { cachedInstagramUsername, hasCachedInstagramAvatar, instagramIdentityKey, resolveInstagramUsernames } from "@/src/lib/meta/username-resolver";
import { presentInboxText } from "@/src/lib/inbox";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

const querySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  query: z.string().trim().max(120).optional(),
  status: z.enum(["open", "closed", "all"]).default("all"),
  unread: z.enum(["true", "false"]).optional(),
  assignment: z.enum(["all", "mine", "unassigned"]).default("all"),
  favorite: z.enum(["true", "false"]).optional(),
  label: z.string().trim().min(1).max(24).optional(),
  reminder: z.enum(["all", "due", "scheduled"]).default("all"),
  sort: z.enum(["newest", "oldest", "unread"]).default("newest"),
  enrich: z.enum(["1"]).optional(),
}).strict();

export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid inbox filters" }, { status: 400 });

  const repository = getRepository();
  let page;
  let members;
  try {
    [page, members] = await Promise.all([repository.listInboxContacts(session.workspaceId, {
      limit: parsed.data.limit,
      sort: parsed.data.sort,
      now: new Date().toISOString(),
      ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
      ...(parsed.data.query ? { query: parsed.data.query } : {}),
      ...(parsed.data.status !== "all" ? { status: parsed.data.status.toUpperCase() as "OPEN" | "CLOSED" } : {}),
      ...(parsed.data.unread ? { unread: parsed.data.unread === "true" } : {}),
      ...(parsed.data.assignment !== "all" ? { assignment: parsed.data.assignment, currentUserId: session.userId } : {}),
      ...(parsed.data.favorite ? { favorite: parsed.data.favorite === "true" } : {}),
      ...(parsed.data.label ? { label: parsed.data.label.toLowerCase() } : {}),
      ...(parsed.data.reminder !== "all" ? { reminder: parsed.data.reminder } : {}),
    }), repository.listMembers(session.workspaceId)]);
  } catch (error) {
    const invalidCursor = error instanceof Error && error.message === "invalid_cursor";
    return NextResponse.json({ error: invalidCursor ? "Invalid cursor" : "Could not load inbox" }, { status: invalidCursor ? 400 : 500 });
  }

  const env = getServerEnv();
  const identities = page.rows.map((row) => row.record);
  const usernames = new Map(identities.flatMap((identity) => {
    const username = cachedInstagramUsername(identity, env.metaApiVersion);
    return username ? [[instagramIdentityKey(identity), username] as const] : [];
  }));
  if (parsed.data.enrich && env.metaTokenEncryptionKey && identities.length) {
    const connections = await repository.listConnections(session.workspaceId);
    const enriched = await resolveInstagramUsernames({
      identities, events: [], connections, apiVersion: env.metaApiVersion,
      client: new MetaClient({ apiVersion: env.metaApiVersion }), tokenEncryptionKey: env.metaTokenEncryptionKey,
    });
    for (const [key, username] of enriched) usernames.set(key, username);
  }
  const needsProfileEnrichment = !parsed.data.enrich && Boolean(env.metaTokenEncryptionKey)
    && identities.some((identity) => !usernames.has(instagramIdentityKey(identity)));
  return NextResponse.json({ data: {
    contacts: page.rows.map(({ record, preview, latestInboundAt, unread }) => ({
      id: record.id,
      username: usernames.get(instagramIdentityKey(record)),
      avatarUrl: hasCachedInstagramAvatar(record, env.metaApiVersion) ? `/api/contacts/${record.id}/avatar` : "",
      preview: presentInboxText(preview),
      lastMessageAt: latestInboundAt ?? record.lastSeenAt,
      canMessage: isWithinMessagingWindow(latestInboundAt),
      unread,
      leadStatus: record.leadStatus,
      tags: record.tags,
      inboxStatus: record.inboxStatus,
      favorite: record.inboxFavorite,
      reminderAt: record.inboxReminderAt,
      assigneeUserId: record.assigneeUserId,
    })),
    members: members.map(({ userId, email, role }) => ({ userId, email, role })).filter((member) => member.userId),
    nextCursor: page.nextCursor,
    needsProfileEnrichment,
  } });
}
