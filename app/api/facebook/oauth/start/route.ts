import { getServerEnv } from "@/src/lib/env";
import { buildFacebookAuthorizeUrl } from "@/src/lib/facebook/oauth";
import { createOAuthState } from "@/src/lib/meta/oauth-state";
import { getValidatedSession } from "@/src/lib/auth/session";
import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getEntitlementService } from "@/src/lib/entitlements/service";
import { entitlementErrorResponse } from "@/src/lib/entitlements/http";

export const runtime = "nodejs";

// Separate cookie from the IG flow so a half-finished IG sign-in does not
// invalidate an in-flight FB sign-in (or vice versa).
export const FACEBOOK_OAUTH_STATE_COOKIE = "linkar_facebook_oauth_state";

function settingsRedirect(env: ReturnType<typeof getServerEnv>, status: string): NextResponse {
  return NextResponse.redirect(new URL(`/settings?facebook=${status}`, env.appUrl));
}

export async function GET(request: Request) {
  const env = getServerEnv();
  const session = await getValidatedSession(request);
  if (!session) {
    const login = new URL("/login", env.appUrl);
    login.searchParams.set("next", "/settings");
    return NextResponse.redirect(login);
  }
  if (!env.facebookAppId) return settingsRedirect(env, "missing-config");
  try {
    await getEntitlementService().assertEntitled(
      session.workspaceId,
      "facebook",
      (await getRepository().listFacebookPages(session.workspaceId)).length,
    );
  } catch (error) {
    return entitlementErrorResponse(error)
      ?? NextResponse.json({ error: "entitlement_check_failed" }, { status: 500 });
  }

  const state = createOAuthState(session.workspaceId, env.authSessionSecret);
  const response = NextResponse.redirect(
    buildFacebookAuthorizeUrl(state, {
      facebookAppId: env.facebookAppId,
      facebookRedirectUri: env.facebookRedirectUri,
      facebookScopes: env.facebookScopes,
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
  return response;
}
