import { getServerEnv } from "@/src/lib/env";
import { buildInstagramAuthorizeUrl } from "@/src/lib/meta/oauth";
import { createOAuthState, META_OAUTH_STATE_COOKIE } from "@/src/lib/meta/oauth-state";
import { getSessionFromRequest } from "@/src/lib/auth/session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function settingsRedirect(env: ReturnType<typeof getServerEnv>, status: string): NextResponse {
  return NextResponse.redirect(new URL(`/settings?meta=${status}`, env.appUrl));
}

export async function GET(request: Request) {
  const env = getServerEnv();
  const session = getSessionFromRequest(request);
  if (!session) {
    const login = new URL("/login", env.appUrl);
    login.searchParams.set("next", "/settings");
    return NextResponse.redirect(login);
  }
  if (!env.metaAppId) return settingsRedirect(env, "missing-config");

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
  return response;
}
