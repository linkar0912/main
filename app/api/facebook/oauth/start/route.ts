import { getServerEnv } from "@/src/lib/env";
import { buildFacebookAuthorizeUrl } from "@/src/lib/facebook/oauth";
import { createOAuthState } from "@/src/lib/meta/oauth-state";
import { checkValidatedSession } from "@/src/lib/auth/session";
import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { EntitlementError, getEntitlementService } from "@/src/lib/entitlements/service";
import { logger } from "@/src/lib/logger";
import { clearOnboardingReturnCookie, connectResultPath, setOnboardingReturnCookie, wantsOnboardingReturn } from "@/src/lib/onboarding/oauth-return";

export const runtime = "nodejs";

// Separate cookie from the IG flow so a half-finished IG sign-in does not
// invalidate an in-flight FB sign-in (or vice versa).
export const FACEBOOK_OAUTH_STATE_COOKIE = "linkar_facebook_oauth_state";

function settingsRedirect(env: ReturnType<typeof getServerEnv>, status: string, toOnboarding = false): NextResponse {
  return NextResponse.redirect(new URL(connectResultPath("facebook", status, toOnboarding), env.appUrl));
}

export async function GET(request: Request) {
  const toOnboarding = wantsOnboardingReturn(request);
  const response = await startConnect(request, toOnboarding);
  // A return cookie left by an onboarding connect that was never finished
  // would otherwise send this Settings connect's result into onboarding.
  return toOnboarding ? response : clearOnboardingReturnCookie(response);
}

async function startConnect(request: Request, toOnboarding: boolean): Promise<NextResponse> {
  const env = getServerEnv();
  const { session, authUnavailable } = await checkValidatedSession(request);
  if (!session) {
    // "No session" may only mean Supabase Auth could not answer; signing in
    // again would not help then.
    if (authUnavailable) return settingsRedirect(env, "unavailable", toOnboarding);
    const login = new URL("/login", env.appUrl);
    login.searchParams.set("next", toOnboarding ? "/onboarding" : "/settings");
    return NextResponse.redirect(login);
  }
  // Same rule as the Instagram connect: connecting a Page is a manager
  // action, and a member should not be sent through Facebook's dialog only
  // to be refused at the Page picker.
  const role = await getRepository().getMemberRole(session.workspaceId, session.email);
  if (role !== "OWNER" && role !== "ADMIN") return settingsRedirect(env, "forbidden", toOnboarding);
  if (!env.facebookAppId) return settingsRedirect(env, "missing-config", toOnboarding);
  try {
    const pages = await getRepository().listFacebookPages(session.workspaceId);
    // Settings' Reconnect sends ?reconnect=<Page connection id>. Renewing a
    // Page the workspace already has never adds one, so that Page is left out
    // of the count (the plan's Facebook switch still applies); the Page
    // picker counts again once the Page is chosen.
    const reconnectId = new URL(request.url).searchParams.get("reconnect");
    await getEntitlementService().assertEntitled(
      session.workspaceId,
      "facebook",
      pages.filter((page) => page.id !== reconnectId).length,
    );
  } catch (error) {
    if (error instanceof EntitlementError) {
      return settingsRedirect(env, error.code === "limit_reached" ? "limit-reached" : "plan-required", toOnboarding);
    }
    logger.error("Facebook connect could not check the plan", {
      workspaceId: session.workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return settingsRedirect(env, "error", toOnboarding);
  }

  const state = createOAuthState(session.workspaceId, session.userId, env.authSessionSecret);
  const response = NextResponse.redirect(
    buildFacebookAuthorizeUrl(state, {
      facebookAppId: env.facebookAppId,
      facebookRedirectUri: env.facebookRedirectUri,
      facebookScopes: env.facebookScopes,
      facebookApiVersion: env.facebookApiVersion,
    }),
  );
  response.cookies.set({
    name: FACEBOOK_OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https://"),
    maxAge: 600,
    path: "/",
  });
  if (toOnboarding) setOnboardingReturnCookie(response, env.appUrl.startsWith("https://"));
  return response;
}
