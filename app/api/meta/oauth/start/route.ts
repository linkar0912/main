import { randomUUID } from "node:crypto";
import { getServerEnv } from "@/src/lib/env";
import { buildInstagramAuthorizeUrl } from "@/src/lib/meta/oauth";
import { META_OAUTH_STATE_COOKIE } from "@/src/lib/meta/oauth-state";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function settingsRedirect(env: ReturnType<typeof getServerEnv>, status: string): NextResponse {
  return NextResponse.redirect(new URL(`/settings?meta=${status}`, env.appUrl));
}

export async function GET() {
  const env = getServerEnv();
  if (!env.metaAppId) return settingsRedirect(env, "missing-config");

  const state = randomUUID();
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
