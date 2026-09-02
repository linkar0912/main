import type { MetaClient } from "./client";
import type { InstagramConnectionRecord, WebhookEventRecord } from "../repository";
import { unsealSecret } from "../security/secrets";

export type InstagramIdentity = {
  instagramAccountId: string;
  igScopedUserId: string;
};

export function instagramIdentityKey(identity: InstagramIdentity): string {
  return `${identity.instagramAccountId}:${identity.igScopedUserId}`;
}

function cleanUsername(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().replace(/^@+/, "").slice(0, 60) || undefined;
}

export async function resolveInstagramUsernames(options: {
  identities: InstagramIdentity[];
  events: WebhookEventRecord[];
  connections?: InstagramConnectionRecord[];
  client?: MetaClient;
  tokenEncryptionKey?: string;
  lookupLimit?: number;
}): Promise<Map<string, string>> {
  const usernames = new Map<string, string>();
  for (const event of options.events) {
    const instagramAccountId = typeof event.payload.accountId === "string" ? event.payload.accountId : undefined;
    const igScopedUserId = typeof event.payload.recipientId === "string" ? event.payload.recipientId : undefined;
    const username = cleanUsername(event.payload.senderUsername);
    if (!instagramAccountId || !igScopedUserId || !username) continue;
    const key = instagramIdentityKey({ instagramAccountId, igScopedUserId });
    if (!usernames.has(key)) usernames.set(key, username);
  }

  if (!options.client || !options.tokenEncryptionKey || !options.connections?.length) return usernames;
  const connections = new Map(options.connections.map((connection) => [connection.igUserId, connection]));
  const unresolved = new Map<string, InstagramIdentity>();
  for (const identity of options.identities) {
    const key = instagramIdentityKey(identity);
    if (!usernames.has(key)) unresolved.set(key, identity);
  }

  await Promise.all([...unresolved.entries()].slice(0, options.lookupLimit ?? 25).map(async ([key, identity]) => {
    const connection = connections.get(identity.instagramAccountId);
    if (!connection || connection.status !== "CONNECTED") return;
    try {
      const profile = await options.client!.getUserProfile({
        igUserId: connection.igUserId,
        accessToken: unsealSecret(connection.accessTokenEncrypted, options.tokenEncryptionKey!),
      }, identity.igScopedUserId);
      const username = cleanUsername(profile.username);
      if (username) usernames.set(key, username);
    } catch {
      // A missing consent grant or stale token must not make Contacts or Inbox fail.
    }
  }));
  return usernames;
}
