import { getServerEnv } from "@/src/lib/env";
import { buildInstagramAuthorizeUrl } from "@/src/lib/meta/oauth";
import { createOAuthState, META_OAUTH_STATE_COOKIE } from "@/src/lib/meta/oauth-state";
import { checkValidatedSession } from "@/src/lib/auth/session";
import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { EntitlementError, getEntitlementService } from "@/src/lib/entitlements/service";
import { logger } from "@/src/lib/logger";
import { clearOnboardingReturnCookie, connectResultPath, setOnboardingReturnCookie, wantsOnboardingReturn } from "@/src/lib/onboarding/oauth-return";

export const runtime = "nodejs";

function settingsRedirect(env: ReturnType<typeof getServerEnv>, status: string, toOnboarding = false): NextResponse {
  return NextResponse.redirect(new URL(connectResultPath("meta", status, toOnboarding), env.appUrl));
}

export async function GET(request: Request) {
  // Onboarding's Connect step sends ?return=onboarding so the result lands
  // back in the flow instead of in Settings.
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
  // Connecting an account changes what the whole workspace sends from, so it
  // is a manager action. This is a browser navigation, not a fetch, so the
  // refusal lands back on Settings with a readable banner instead of raw JSON.
  const role = await getRepository().getMemberRole(session.workspaceId, session.email);
  if (role !== "OWNER" && role !== "ADMIN") return settingsRedirect(env, "forbidden", toOnboarding);
  if (!env.metaAppId) return settingsRedirect(env, "missing-config", toOnboarding);
  try {
    const connections = await getRepository().listConnections(session.workspaceId);
    // Settings' Reconnect sends ?reconnect=<connection id>. Renewing an
    // account the workspace already has never adds one, so that account is
    // left out of the count; the callback counts again once it knows which
    // account came back.
    const reconnectId = new URL(request.url).searchParams.get("reconnect");
    await getEntitlementService().assertEntitled(
      session.workspaceId,
      "instagram",
      connections.filter((connection) => connection.id !== reconnectId).length,
    );
  } catch (error) {
    if (error instanceof EntitlementError) {
      return settingsRedirect(env, error.code === "limit_reached" ? "limit-reached" : "plan-required", toOnboarding);
    }
    logger.error("Instagram connect could not check the plan", {
      workspaceId: session.workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return settingsRedirect(env, "error", toOnboarding);
  }

  const state = createOAuthState(session.workspaceId, session.userId, env.authSessionSecret);
  const response = NextResponse.redirect(
    buildInstagramAuthorizeUrl(state, {
      metaAppId: env.metaAppId,
      metaRedirectUri: env.metaRedirectUri,
      metaScopes: env.metaScopes,
    }),
  );
  response.cookies.set({
    name: META_OAUTH_STATE_COOKIE,
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
