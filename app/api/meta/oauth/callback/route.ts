import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import { exchangeInstagramCode } from "@/src/lib/meta/oauth";
import { MetaClient } from "@/src/lib/meta/client";
import { META_OAUTH_STATE_COOKIE, readOAuthState } from "@/src/lib/meta/oauth-state";
import { sealSecret } from "@/src/lib/security/secrets";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

function settingsRedirect(env: ReturnType<typeof getServerEnv>, status: string): NextResponse {
  return NextResponse.redirect(new URL(`/settings?meta=${status}`, env.appUrl));
}

export async function GET(request: Request) {
  const env = getServerEnv();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = (await cookies()).get(META_OAUTH_STATE_COOKIE)?.value;
  const responseState = state && storedState && state === storedState
    ? readOAuthState(state, env.authSessionSecret)
    : null;

  if (!code || !responseState) return settingsRedirect(env, "invalid-state");
  if (!env.metaTokenEncryptionKey) return settingsRedirect(env, "missing-encryption-key");

  try {
    const token = await exchangeInstagramCode(code, env);
    const tokenExpiresAt = token.expiresIn
      ? new Date(Date.now() + token.expiresIn * 1_000).toISOString()
      : undefined;
    const bootstrapConnection = { igUserId: token.userId, accessToken: token.accessToken };
    const client = new MetaClient({ apiVersion: env.metaApiVersion });
    const profile = await client.getOwnProfile(bootstrapConnection);
    const connection = { igUserId: profile.id, accessToken: token.accessToken };
    await client.subscribeToWebhooks(connection);
    await getRepository().upsertConnection({
      workspaceId: responseState.workspaceId,
      igUserId: profile.id,
      username: profile.username,
      accessTokenEncrypted: sealSecret(token.accessToken, env.metaTokenEncryptionKey),
      tokenExpiresAt,
      status: "CONNECTED",
    });
    const response = settingsRedirect(env, "connected");
    response.cookies.delete(META_OAUTH_STATE_COOKIE);
    return response;
  } catch (error) {
    logger.error("Instagram OAuth callback failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return settingsRedirect(env, "error");
  }
}
