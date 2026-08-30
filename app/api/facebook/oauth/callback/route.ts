import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import {
  exchangeFacebookCode,
  getFacebookUserId,
  listFacebookPages,
  validateFacebookPermissions,
  FacebookOAuthError,
  FacebookPermissionError,
  FacebookPageSummary,
} from "@/src/lib/facebook/oauth";
import { FacebookApiError } from "@/src/lib/facebook/client";
import { readOAuthState } from "@/src/lib/meta/oauth-state";
import { FACEBOOK_OAUTH_STATE_COOKIE } from "../start/route";
import { createFacebookPageSelection, FACEBOOK_PAGE_SELECTION_COOKIE } from "@/src/lib/facebook/page-selection";

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
    await validateFacebookPermissions(token.accessToken, env.facebookApiVersion);
    const facebookUserId = await getFacebookUserId(token.accessToken, env.facebookApiVersion);
    const pages: FacebookPageSummary[] = await listFacebookPages(token.accessToken, env.facebookApiVersion);
    if (pages.length === 0) {
      return withoutStateCookie(settingsRedirect(env, "no-pages"));
    }
    const response = settingsRedirect(env, "select-page");
    response.cookies.set({
      name: FACEBOOK_PAGE_SELECTION_COOKIE,
      value: createFacebookPageSelection({
        workspaceId: responseState.workspaceId,
        facebookUserId,
        userAccessToken: token.accessToken,
        tokenExpiresAt,
        selectionExpiresAt: new Date(Date.now() + 10 * 60 * 1_000).toISOString(),
      }, env.facebookTokenEncryptionKey),
      httpOnly: true,
      sameSite: "lax",
      secure: env.appUrl.startsWith("https://"),
      maxAge: 600,
      path: "/",
    });
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
    return withoutStateCookie(settingsRedirect(env, status));
  }
}
