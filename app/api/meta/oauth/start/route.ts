import { getServerEnv } from "@/src/lib/env";
import { buildInstagramAuthorizeUrl } from "@/src/lib/meta/oauth";
import { createOAuthState, META_OAUTH_STATE_COOKIE } from "@/src/lib/meta/oauth-state";
import { getValidatedSession } from "@/src/lib/auth/session";
import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getEntitlementService } from "@/src/lib/entitlements/service";
import { entitlementErrorResponse } from "@/src/lib/entitlements/http";
import { connectResultPath, setOnboardingReturnCookie, wantsOnboardingReturn } from "@/src/lib/onboarding/oauth-return";

export const runtime = "nodejs";

function settingsRedirect(env: ReturnType<typeof getServerEnv>, status: string, toOnboarding = false): NextResponse {
  return NextResponse.redirect(new URL(connectResultPath("meta", status, toOnboarding), env.appUrl));
}

export async function GET(request: Request) {
  const env = getServerEnv();
  // Onboarding's Connect step sends ?return=onboarding so the result lands
  // back in the flow instead of in Settings.
  const toOnboarding = wantsOnboardingReturn(request);
  const session = await getValidatedSession(request);
  if (!session) {
    const login = new URL("/login", env.appUrl);
    login.searchParams.set("next", "/settings");
    return NextResponse.redirect(login);
  }
  // Connecting an account changes what the whole workspace sends from, so it
  // is a manager action. This is a browser navigation, not a fetch, so the
  // refusal lands back on Settings with a readable banner instead of raw JSON.
  const role = await getRepository().getMemberRole(session.workspaceId, session.email);
  if (role !== "OWNER" && role !== "ADMIN") return settingsRedirect(env, "forbidden", toOnboarding);
  if (!env.metaAppId) return settingsRedirect(env, "missing-config", toOnboarding);
  try {
    await getEntitlementService().assertEntitled(
      session.workspaceId,
      "instagram",
      (await getRepository().listConnections(session.workspaceId)).length,
    );
  } catch (error) {
    return entitlementErrorResponse(error)
      ?? NextResponse.json({ error: "entitlement_check_failed" }, { status: 500 });
  }

  const state = createOAuthState(session.workspaceId, env.authSessionSecret);
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
