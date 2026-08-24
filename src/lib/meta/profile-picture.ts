import { unsealSecret } from "../security/secrets";
import { MetaClient } from "./client";

import { INSTAGRAM_LOGIN_API_VERSION } from "./client";

type LoadOptions = {
  apiVersion?: string;
  metaTokenEncryptionKey?: string | null;
};

const PROFILE_PICTURE_TTL_MS = 15 * 60 * 1_000;
type CachedPicture = { expiresAt: number; value?: string | null; pending?: Promise<string | null> };
const profilePictureCache = new Map<string, CachedPicture>();

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
  profilePictureCache.set(cacheKey, { expiresAt: Date.now() + PROFILE_PICTURE_TTL_MS, pending });
  const value = await pending;
  profilePictureCache.set(cacheKey, { expiresAt: Date.now() + PROFILE_PICTURE_TTL_MS, value });
  return value;
}
