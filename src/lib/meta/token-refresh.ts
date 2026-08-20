import type { AutomationRepository } from "../repository";
import { sealSecret, unsealSecret } from "../security/secrets";
import { MetaOAuthError } from "./oauth";

type RefreshResult = { accessToken: string; expiresIn?: number };
type RefreshToken = (token: string) => Promise<RefreshResult>;

const REFRESH_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

export async function refreshExpiringInstagramTokens(
  repository: AutomationRepository,
  encryptionKey: string,
  refreshToken: RefreshToken,
  now = new Date(),
): Promise<{ refreshed: number; failed: number }> {
  const dueBefore = new Date(now.getTime() + REFRESH_WINDOW_MS).toISOString();
  const connections = await repository.listConnectionsExpiringBefore(dueBefore);
  let refreshed = 0;
  let failed = 0;

  for (const connection of connections) {
    try {
      const currentToken = unsealSecret(connection.accessTokenEncrypted, encryptionKey);
      const result = await refreshToken(currentToken);
      const tokenExpiresAt = result.expiresIn
        ? new Date(now.getTime() + result.expiresIn * 1_000).toISOString()
        : connection.tokenExpiresAt;
      await repository.updateConnectionToken(
        connection.id,
        sealSecret(result.accessToken, encryptionKey),
        tokenExpiresAt,
      );
      refreshed += 1;
    } catch (error) {
      if (
        (connection.tokenExpiresAt && connection.tokenExpiresAt <= now.toISOString()) ||
        (error instanceof MetaOAuthError && !error.retryable)
      ) {
        await repository.updateConnectionStatus(connection.id, "EXPIRED");
      }
      failed += 1;
    }
  }

  return { refreshed, failed };
}
