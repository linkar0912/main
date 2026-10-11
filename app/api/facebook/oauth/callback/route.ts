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
import { clearOnboardingReturnCookie, connectResultPath, OAUTH_RETURN_COOKIE, readsOnboardingReturn } from "@/src/lib/onboarding/oauth-return";

export const runtime = "nodejs";

/**
 * Status redirect: Settings as before, or back into onboarding when the
 * connect was started there (oauth-return.ts). The return cookie is cleared
 * on the way out either way.
 */
function settingsRedirect(env: ReturnType<typeof getServerEnv>, status: string, toOnboarding: boolean): NextResponse {
  return clearOnboardingReturnCookie(NextResponse.redirect(new URL(connectResultPath("facebook", status, toOnboarding), env.appUrl)));
}

function withoutStateCookie(response: NextResponse): NextResponse {
  response.cookies.delete(FACEBOOK_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: Request) {
  const env = getServerEnv();
  const toOnboarding = readsOnboardingReturn((await cookies()).get(OAUTH_RETURN_COOKIE)?.value);
  const redirectTo = (status: string) => settingsRedirect(env, status, toOnboarding);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) {
    const metaError = url.searchParams.get("error");
    if (metaError === "access_denied") {
      return redirectTo("cancelled");
    }
    if (metaError) {
      logger.warn("Facebook OAuth redirect returned an error", {
        error: metaError,
        errorCode: url.searchParams.get("error_code"),
        description: url.searchParams.get("error_description"),
      });
      return redirectTo("denied");
    }
  }

  const storedState = (await cookies()).get(FACEBOOK_OAUTH_STATE_COOKIE)?.value;
  const responseState = state && storedState && state === storedState
    ? readOAuthState(state, env.authSessionSecret)
    : null;

  if (!code || !responseState) {
    return withoutStateCookie(redirectTo("invalid-state"));
  }
  if (!env.facebookTokenEncryptionKey) {
    return withoutStateCookie(redirectTo("missing-encryption-key"));
  }

  try {
    const token = await exchangeFacebookCode(code, env);
    const tokenExpiresAt = token.expiresIn
      ? new Date(Date.now() + token.expiresIn * 1_000).toISOString()
      : undefined;
    await validateFacebookPermissions(token.accessToken, env.facebookApiVersion, undefined, env.facebookAppSecret);
    const facebookUserId = await getFacebookUserId(token.accessToken, env.facebookApiVersion, undefined, env.facebookAppSecret);
    const pages: FacebookPageSummary[] = await listFacebookPages(token.accessToken, env.facebookApiVersion, undefined, env.facebookAppSecret);
    if (pages.length === 0) {
      return withoutStateCookie(redirectTo("no-pages"));
    }
    const response = redirectTo("select-page");
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
    return withoutStateCookie(redirectTo(status));
  }
}
