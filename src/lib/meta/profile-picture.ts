import { unsealSecret } from "../security/secrets";
import { MetaClient } from "./client";

import { INSTAGRAM_LOGIN_API_VERSION } from "./client";

type LoadOptions = {
  apiVersion?: string;
  metaTokenEncryptionKey?: string | null;
};

const PROFILE_PICTURE_TTL_MS = 15 * 60 * 1_000;
// The cache is keyed on `${apiVersion}:${igUserId}` so an environment that flips
// META_API_VERSION grows a fresh namespace. Cap the size so a long-lived process
// with one-off igUserIds cannot grow the Map unbounded and DoS the worker.
const PROFILE_PICTURE_CACHE_LIMIT = 5_000;
type CachedPicture = { expiresAt: number; value?: string | null; pending?: Promise<string | null> };
const profilePictureCache = new Map<string, CachedPicture>();

function pruneExpired(now: number): void {
  for (const [key, entry] of profilePictureCache) {
    if (entry.expiresAt <= now) profilePictureCache.delete(key);
  }
}

function trimToLimit(now: number): void {
  pruneExpired(now);
  // Map iteration is insertion-ordered, so once we've dropped expired entries
  // the first key we encounter is the oldest live one - the right candidate
  // for eviction when the cap is hit.
  while (profilePictureCache.size > PROFILE_PICTURE_CACHE_LIMIT) {
    const oldest = profilePictureCache.keys().next().value;
    if (oldest === undefined) break;
    profilePictureCache.delete(oldest);
  }
}

export function clearProfilePictureCache(igUserId?: string): void {
  if (!igUserId) {
    profilePictureCache.clear();
    return;
  }
  for (const key of profilePictureCache.keys()) {
    if (key.endsWith(`:${igUserId}`)) profilePictureCache.delete(key);
  }
}

/**
 * Best-effort avatar lookup for a connected Instagram professional account.
 * Any failure resolves to null so callers can fall back to their static
 * placeholder without error handling.
 */
export async function loadProfilePictureUrl(
  options: LoadOptions,
  igUserId: string,
  sealedAccessToken: string,
): Promise<string | null> {
  if (!options.metaTokenEncryptionKey) return null;
  const apiVersion = options.apiVersion ?? INSTAGRAM_LOGIN_API_VERSION;
  const cacheKey = `${apiVersion}:${igUserId}`;
  const cached = profilePictureCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.value !== undefined) return cached.value;
    if (cached.pending) return cached.pending;
  }

  const pending = (async () => {
    try {
      const client = new MetaClient({ apiVersion });
      return await client.getProfilePictureUrl({
        igUserId,
        accessToken: unsealSecret(sealedAccessToken, options.metaTokenEncryptionKey!),
      });
    } catch {
      return null;
    }
  })();
  trimToLimit(Date.now());
  profilePictureCache.set(cacheKey, { expiresAt: Date.now() + PROFILE_PICTURE_TTL_MS, pending });
  const value = await pending;
  profilePictureCache.set(cacheKey, { expiresAt: Date.now() + PROFILE_PICTURE_TTL_MS, value });
  return value;
}
