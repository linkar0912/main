import type { MetaClient } from "./client";
import type { InstagramConnectionRecord, WebhookEventRecord } from "../repository";
import { unsealSecret } from "../security/secrets";

export type InstagramIdentity = {
  instagramAccountId: string;
  igScopedUserId: string;
};

export type ResolvedInstagramProfile = {
  username?: string;
  profilePictureUrl?: string;
};

// Resolved profiles are cached for 15 minutes (same TTL as the workspace
// avatar cache in profile-picture.ts). Without this, every inbox/contacts
// load - and every single avatar <img> request - re-fetched
// GET /{ig-scoped-id}?fields=username,profile_pic from Meta, which dominated
// page latency. Ordering never depended on these calls: the inbox sorts on
// WebhookEvent.receivedAt in SQL.
const PROFILE_LOOKUP_TTL_MS = 15 * 60 * 1_000;
const PROFILE_LOOKUP_CACHE_LIMIT = 5_000;
type CachedProfile = { expiresAt: number; value?: ResolvedInstagramProfile; pending?: Promise<ResolvedInstagramProfile> };
const profileLookupCache = new Map<string, CachedProfile>();

/** Test isolation helper: clears resolved usernames/avatars between specs. */
export function clearResolvedProfileCache(): void {
  profileLookupCache.clear();
}

function profileCacheKey(apiVersion: string | undefined, identity: InstagramIdentity): string {
  return `${apiVersion ?? ""}:${identity.instagramAccountId}:${identity.igScopedUserId}`;
}

/**
 * Cached best-effort lookup of one contact's username + profile picture.
 * Failures resolve to {} so a stale token or missing consent grant never
 * breaks the inbox, contacts, or avatar routes. Concurrent callers share one
 * in-flight Meta request.
 */
export async function resolveInstagramProfile(options: {
  identity: InstagramIdentity;
  connection: InstagramConnectionRecord | undefined;
  client: MetaClient;
  tokenEncryptionKey: string;
  apiVersion?: string;
}): Promise<ResolvedInstagramProfile> {
  if (!options.connection || options.connection.status !== "CONNECTED") return {};
  const key = profileCacheKey(options.apiVersion, options.identity);
  const cached = profileLookupCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.value !== undefined) return cached.value;
    if (cached.pending) return cached.pending;
  }

  const connection = options.connection;
  const pending = (async (): Promise<ResolvedInstagramProfile> => {
    try {
      const profile = await options.client.getUserProfile({
        igUserId: connection.igUserId,
        accessToken: unsealSecret(connection.accessTokenEncrypted, options.tokenEncryptionKey),
      }, options.identity.igScopedUserId);
      const username = cleanUsername(profile.username);
      return {
        ...(username ? { username } : {}),
        ...(profile.profilePictureUrl ? { profilePictureUrl: profile.profilePictureUrl } : {}),
      };
    } catch {
      return {};
    }
  })();
  // Insertion-ordered Map: evict the oldest live entry when the cap is hit so
  // one-off identities can't grow the cache unbounded.
  while (profileLookupCache.size >= PROFILE_LOOKUP_CACHE_LIMIT) {
    const oldest = profileLookupCache.keys().next().value;
    if (oldest === undefined) break;
    profileLookupCache.delete(oldest);
  }
  profileLookupCache.set(key, { expiresAt: Date.now() + PROFILE_LOOKUP_TTL_MS, pending });
  const value = await pending;
  profileLookupCache.set(key, { expiresAt: Date.now() + PROFILE_LOOKUP_TTL_MS, value });
  return value;
}


export function instagramIdentityKey(identity: InstagramIdentity): string {
  return `${identity.instagramAccountId}:${identity.igScopedUserId}`;
}

/** Read an already resolved name without starting a Meta request. */
export function cachedInstagramUsername(identity: InstagramIdentity, apiVersion?: string): string | undefined {
  const cached = profileLookupCache.get(profileCacheKey(apiVersion, identity));
  return cached && cached.expiresAt > Date.now() ? cached.value?.username : undefined;
}

export function hasCachedInstagramAvatar(identity: InstagramIdentity, apiVersion?: string): boolean {
  const cached = profileLookupCache.get(profileCacheKey(apiVersion, identity));
  return Boolean(cached && cached.expiresAt > Date.now() && cached.value?.profilePictureUrl);
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
  /** Included in the cache key so flipping META_API_VERSION grows a fresh namespace. */
  apiVersion?: string;
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

  for (const identity of options.identities) {
    const key = instagramIdentityKey(identity);
    const cached = cachedInstagramUsername(identity, options.apiVersion);
    if (cached && !usernames.has(key)) usernames.set(key, cached);
  }

  if (!options.client || !options.tokenEncryptionKey || !options.connections?.length) return usernames;
  const connections = new Map(options.connections.map((connection) => [connection.igUserId, connection]));
  const unresolved = new Map<string, InstagramIdentity>();
  for (const identity of options.identities) {
    const key = instagramIdentityKey(identity);
    if (!usernames.has(key)) unresolved.set(key, identity);
  }

  await Promise.all([...unresolved.entries()].slice(0, options.lookupLimit ?? 25).map(async ([key, identity]) => {
    const profile = await resolveInstagramProfile({
      identity,
      connection: connections.get(identity.instagramAccountId),
      client: options.client!,
      tokenEncryptionKey: options.tokenEncryptionKey!,
      ...(options.apiVersion ? { apiVersion: options.apiVersion } : {}),
    });
    if (profile.username) usernames.set(key, profile.username);
  }));
  return usernames;
}
