import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkValidatedSession } from "@/src/lib/auth/session";
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
import { clearOnboardingReturnCookie, connectResultPath, OAUTH_RETURN_COOKIE, readsOnboardingReturn } from "@/src/lib/onboarding/oauth-return";

export const runtime = "nodejs";

/**
 * Status redirect: Settings as before, or back into onboarding when the
 * connect was started there (oauth-return.ts). The return cookie is cleared
 * on the way out either way.
 */
function settingsRedirect(env: ReturnType<typeof getServerEnv>, status: string, toOnboarding: boolean): NextResponse {
  return clearOnboardingReturnCookie(NextResponse.redirect(new URL(connectResultPath("meta", status, toOnboarding), env.appUrl)));
}

function withoutStateCookie(response: NextResponse): NextResponse {
  response.cookies.delete(META_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: Request) {
  const env = getServerEnv();
  const toOnboarding = readsOnboardingReturn((await cookies()).get(OAUTH_RETURN_COOKIE)?.value);
  const redirectTo = (status: string) => settingsRedirect(env, status, toOnboarding);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Meta redirects back WITHOUT a code when the person cancels or the app config
  // blocks authorization - surface that distinctly instead of blaming the state cookie.
  if (!code) {
    const metaError = url.searchParams.get("error");
    if (metaError === "access_denied") {
      return withoutStateCookie(redirectTo("cancelled"));
    }
    if (metaError) {
      logger.warn("Instagram OAuth redirect returned an error", {
        error: metaError,
        errorCode: url.searchParams.get("error_code"),
        description: url.searchParams.get("error_description"),
      });
      return withoutStateCookie(redirectTo("denied"));
    }
  }

  const storedState = (await cookies()).get(META_OAUTH_STATE_COOKIE)?.value;
  const responseState = state && storedState && state === storedState
    ? readOAuthState(state, env.authSessionSecret)
    : null;

  if (!code || !responseState) {
    return withoutStateCookie(redirectTo("invalid-state"));
  }
  if (!env.metaTokenEncryptionKey) {
    return withoutStateCookie(redirectTo("missing-encryption-key"));
  }

  try {
    const repository = getRepository();
    // Only the person who started the connect, still a manager of the same
    // workspace, may finish it. The state cookie alone does not show that: a
    // shared browser can hold one person's state while someone else is
    // signed in.
    const { session, authUnavailable } = await checkValidatedSession(request);
    if (authUnavailable) return withoutStateCookie(redirectTo("unavailable"));
    if (
      !session
      || !responseState.userId
      || session.userId !== responseState.userId
      || session.workspaceId !== responseState.workspaceId
    ) {
      return withoutStateCookie(redirectTo("invalid-state"));
    }
    const role = await repository.getMemberRole(session.workspaceId, session.email);
    if (role !== "OWNER" && role !== "ADMIN") return withoutStateCookie(redirectTo("forbidden"));

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
    // Deliberately checked here, immediately before the write, rather than at
    // the top of the handler before the Meta network round-trips above - that
    // used to leave a multi-second window where two concurrent connects could
    // both read the same pre-connection count and both pass. This is a
    // narrowing mitigation, not a full fix: the read-then-write gap here is
    // still not atomic without a DB-level lock or reservation row, but it
    // shrinks the race window from "the whole OAuth exchange" to "one
    // in-process count query."
    //
    // The account that just came back is left out of the count: reconnecting
    // an account the workspace already has (an expired one, say) renews its
    // row instead of adding one.
    await getEntitlementService().assertEntitled(
      responseState.workspaceId,
      "instagram",
      (await repository.listConnections(responseState.workspaceId)).filter((c) => c.igUserId !== profile.id).length,
    );
    await repository.upsertConnection({
      workspaceId: responseState.workspaceId,
      igUserId: profile.id,
      username: profile.username,
      accessTokenEncrypted: sealSecret(token.accessToken, env.metaTokenEncryptionKey),
      tokenExpiresAt,
      status: "CONNECTED",
    });
    clearProfilePictureCache(profile.id);
    const response = redirectTo("connected");
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
    return withoutStateCookie(redirectTo(status));
  }
}
