import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import {
  exchangeFacebookCode,
  listFacebookPages,
  subscribeFacebookPageToWebhooks,
  FacebookOAuthError,
  FacebookPermissionError,
  FacebookPageSummary,
} from "@/src/lib/facebook/oauth";
import { FacebookApiError } from "@/src/lib/facebook/client";
import { createOAuthState as _unused, readOAuthState } from "@/src/lib/meta/oauth-state";
import { sealSecret } from "@/src/lib/security/secrets";
import { getRepository } from "@/src/lib/repository-provider";
import { FacebookPageOwnershipError } from "@/src/lib/repository";
import { FACEBOOK_OAUTH_STATE_COOKIE } from "../start/route";

export const runtime = "nodejs";

function settingsRedirect(env: ReturnType<typeof getServerEnv>, status: string): NextResponse {
  return NextResponse.redirect(new URL(`/settings?facebook=${status}`, env.appUrl));
}

function withoutStateCookie(response: NextResponse): NextResponse {
  response.cookies.delete(FACEBOOK_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: Request) {
  const env = getServerEnv();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) {
    const metaError = url.searchParams.get("error");
    if (metaError === "access_denied") {
      return settingsRedirect(env, "cancelled");
    }
    if (metaError) {
      logger.warn("Facebook OAuth redirect returned an error", {
        error: metaError,
        errorCode: url.searchParams.get("error_code"),
        description: url.searchParams.get("error_description"),
      });
      return settingsRedirect(env, "denied");
    }
  }

  const storedState = (await cookies()).get(FACEBOOK_OAUTH_STATE_COOKIE)?.value;
  const responseState = state && storedState && state === storedState
    ? readOAuthState(state, env.authSessionSecret)
    : null;

  if (!code || !responseState) {
    return withoutStateCookie(settingsRedirect(env, "invalid-state"));
  }
  if (!env.facebookTokenEncryptionKey) {
    return withoutStateCookie(settingsRedirect(env, "missing-encryption-key"));
  }

  try {
    const token = await exchangeFacebookCode(code, env);
    const tokenExpiresAt = token.expiresIn
      ? new Date(Date.now() + token.expiresIn * 1_000).toISOString()
      : undefined;
    const pages: FacebookPageSummary[] = await listFacebookPages(token.accessToken, env.facebookApiVersion);
    if (pages.length === 0) {
      return withoutStateCookie(settingsRedirect(env, "no-pages"));
    }
    // For v1 we auto-connect the first Page the user administers. A future
    // UX iteration can add a Page picker so owners with multiple Pages can
    // pick which one to connect.
    const page = pages[0]!;
    const subscription = await subscribeFacebookPageToWebhooks(
      page.id,
      page.accessToken,
      env.facebookApiVersion,
    );
    if (!subscription.subscribed) {
      logger.warn("Facebook webhook subscription degraded", {
        pageId: page.id,
        error: subscription.error,
      });
    }
    await getRepository().upsertFacebookPage({
      workspaceId: responseState.workspaceId,
      pageId: page.id,
      pageName: page.name,
      accessTokenEncrypted: sealSecret(page.accessToken, env.facebookTokenEncryptionKey),
      tokenExpiresAt,
      status: "CONNECTED",
    });
    const response = settingsRedirect(env, "connected");
    response.cookies.delete(FACEBOOK_OAUTH_STATE_COOKIE);
    return response;
  } catch (error) {
    logger.error("Facebook OAuth callback failed", {
      error: error instanceof Error ? error.message : String(error),
      type: error instanceof Error ? error.name : typeof error,
    });
    let status = "error";
    if (error instanceof FacebookPermissionError) status = "missing-permissions";
    else if (error instanceof FacebookOAuthError) status = "token-exchange";
    else if (error instanceof FacebookApiError) status = "page-listing";
    else if (error instanceof FacebookPageOwnershipError) status = "already-connected";
    return withoutStateCookie(settingsRedirect(env, status));
  }
}
