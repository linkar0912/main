import { unsealSecret } from "../security/secrets";
import { MetaClient } from "./client";

import { INSTAGRAM_LOGIN_API_VERSION } from "./client";

type LoadOptions = {
  apiVersion?: string;
  metaTokenEncryptionKey?: string | null;
};

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
  try {
    const client = new MetaClient({ apiVersion: options.apiVersion ?? INSTAGRAM_LOGIN_API_VERSION });
    return await client.getProfilePictureUrl({
      igUserId,
      accessToken: unsealSecret(sealedAccessToken, options.metaTokenEncryptionKey),
    });
  } catch {
    return null;
  }
}
