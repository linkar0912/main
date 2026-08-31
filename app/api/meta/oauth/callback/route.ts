import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import { exchangeInstagramCode, InstagramPermissionError, MetaOAuthError } from "@/src/lib/meta/oauth";
import { MetaClient, MetaApiError } from "@/src/lib/meta/client";
import { META_OAUTH_STATE_COOKIE, readOAuthState } from "@/src/lib/meta/oauth-state";
import { sealSecret } from "@/src/lib/security/secrets";
import { clearProfilePictureCache } from "@/src/lib/meta/profile-picture";
import { getRepository } from "@/src/lib/repository-provider";
import { InstagramAccountOwnershipError } from "@/src/lib/repository";
import { getEntitlementService } from "@/src/lib/entitlements/service";

export const runtime = "nodejs";

function settingsRedirect(env: ReturnType<typeof getServerEnv>, status: string): NextResponse {
  return NextResponse.redirect(new URL(`/settings?meta=${status}`, env.appUrl));
}

function withoutStateCookie(response: NextResponse): NextResponse {
  response.cookies.delete(META_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: Request) {
  const env = getServerEnv();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Meta redirects back WITHOUT a code when the person cancels or the app config
  // blocks authorization - surface that distinctly instead of blaming the state cookie.
  if (!code) {
    const metaError = url.searchParams.get("error");
    if (metaError === "access_denied") {
      return settingsRedirect(env, "cancelled");
    }
    if (metaError) {
      logger.warn("Instagram OAuth redirect returned an error", {
        error: metaError,
        errorCode: url.searchParams.get("error_code"),
        description: url.searchParams.get("error_description"),
      });
      return settingsRedirect(env, "denied");
    }
  }

  const storedState = (await cookies()).get(META_OAUTH_STATE_COOKIE)?.value;
  const responseState = state && storedState && state === storedState
    ? readOAuthState(state, env.authSessionSecret)
    : null;

  if (!code || !responseState) {
    return withoutStateCookie(settingsRedirect(env, "invalid-state"));
  }
  if (!env.metaTokenEncryptionKey) {
    return withoutStateCookie(settingsRedirect(env, "missing-encryption-key"));
  }

  try {
    const repository = getRepository();
    await getEntitlementService().assertEntitled(
      responseState.workspaceId,
      "instagram",
      (await repository.listConnections(responseState.workspaceId)).length,
    );
    const token = await exchangeInstagramCode(code, env);
    const tokenExpiresAt = token.expiresIn
      ? new Date(Date.now() + token.expiresIn * 1_000).toISOString()
      : undefined;
    const bootstrapConnection = { igUserId: token.userId, accessToken: token.accessToken };
    const client = new MetaClient({ apiVersion: env.metaApiVersion });
    let profile: { id: string; username: string };
    try {
      profile = await client.getOwnProfile(bootstrapConnection);
    } catch (error) {
      if (!(error instanceof MetaApiError)) throw error;
      // MetaApiError(message, status, responseReceived, retryable). Preserve the
      // responseReceived flag from the original error so downstream classifiers
      // (e.g. classifyProviderFailure) can still tell HTTP-failure from
      // transport-failure. The status-based default for retryable keeps the
      // existing semantics.
      throw new MetaApiError(
        `Could not read the Instagram profile from Meta: ${error.message}`,
        error.status,
        error.responseReceived,
      );
    }
    const connection = { igUserId: profile.id, accessToken: token.accessToken };
    // Best-effort: a rejected/degraded subscription must not undo a successful sign-in.
    // The settings health check reports whatever Meta is (not) sending.
    const subscription = await client.subscribeToWebhooks(connection);
    if (subscription.error) {
      logger.warn("Instagram webhook subscription degraded", {
        igUserId: profile.id,
        subscribedFields: subscription.fields,
        requestedFields: subscription.requested,
        error: subscription.error,
      });
    }
    await repository.upsertConnection({
      workspaceId: responseState.workspaceId,
      igUserId: profile.id,
      username: profile.username,
      accessTokenEncrypted: sealSecret(token.accessToken, env.metaTokenEncryptionKey),
      tokenExpiresAt,
      status: "CONNECTED",
    });
    clearProfilePictureCache(profile.id);
    const response = settingsRedirect(env, "connected");
    response.cookies.delete(META_OAUTH_STATE_COOKIE);
    return response;
  } catch (error) {
    logger.error("Instagram OAuth callback failed", {
      error: error instanceof Error ? error.message : String(error),
      type: error instanceof Error ? error.name : typeof error,
    });
    let status = "error";
    if (error instanceof InstagramPermissionError) status = "missing-permissions";
    else if (error instanceof MetaOAuthError) status = "token-exchange";
    else if (error instanceof MetaApiError && error.message.includes("profile")) status = "profile-fetch";
    else if (error instanceof InstagramAccountOwnershipError) status = "already-connected";
    else if (error instanceof Error && error.message === "entitlement_required") status = "plan-required";
    else if (error instanceof Error && error.message === "limit_reached") status = "limit-reached";
    return withoutStateCookie(settingsRedirect(env, status));
  }
}
