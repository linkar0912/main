import type { AutomationRepository } from "../repository";
import { sealSecret, unsealSecret } from "../security/secrets";
import { notifyWorkspaceManagers } from "../notifications";
import { logger } from "../logger";
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
      const expired =
        (connection.tokenExpiresAt && connection.tokenExpiresAt <= now.toISOString()) ||
        (error instanceof MetaOAuthError && !error.retryable);
      // Previously only counted, never logged with the actual cause - a batch
      // failing for a code defect (bad response shape, a bug here) looked
      // identical in the logs to ordinary token expiry, with zero diagnostic
      // trail to tell them apart.
      logger.warn("Instagram token refresh failed", {
        connectionId: connection.id,
        workspaceId: connection.workspaceId,
        igUserId: connection.igUserId,
        markedExpired: Boolean(expired),
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : typeof error,
      });
      if (expired) {
        await repository.updateConnectionStatus(connection.id, "EXPIRED");
        void notifyWorkspaceManagers(
          connection.workspaceId,
          `token-expired:${connection.id}`,
          `Action needed: reconnect @${connection.username}`,
          `The Instagram connection for @${connection.username} expired, so its automations cannot deliver right now. Reconnect the account from Settings to resume.`,
        ).catch(() => undefined);
      }
      failed += 1;
    }
  }

  return { refreshed, failed };
}
