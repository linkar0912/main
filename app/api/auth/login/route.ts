import { NextResponse } from "next/server";
import { safeNextPath } from "@/src/lib/auth/session";
import { LoginRateLimitStore, loginRateLimitKey } from "@/src/lib/auth/rate-limit";
import { clientAddress } from "@/src/lib/auth/client-address";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { applicationOriginForPath } from "@/src/lib/site-routing";

export const runtime = "nodejs";

let loginLimiter: LoginRateLimitStore | undefined;

export async function POST(request: Request) {
  const env = getServerEnv();
  loginLimiter ??= new LoginRateLimitStore(env.redisUrl);
  const address = clientAddress(request, env.trustedProxyHops);
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const nextPath = safeNextPath(String(form.get("next") ?? "/dashboard"));
  const destinationOrigin = applicationOriginForPath(nextPath, env);

  const limitKey = loginRateLimitKey(env.authSessionSecret, email || "-", address);
  if (!(await loginLimiter.isAllowed(limitKey))) {
    return NextResponse.redirect(new URL("/login?error=locked", destinationOrigin), 303);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await loginLimiter.recordFailure(limitKey);
    const url = new URL("/login", destinationOrigin);
    url.searchParams.set("error", "invalid");
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url, 303);
  }

  const workspaceId = await getRepository().findWorkspaceIdByMemberEmail(email);
  const platformOwner = Boolean(data.user?.id && env.platformOwnerUserIds.includes(data.user.id.toLowerCase()));
  if (!workspaceId && !(platformOwner && nextPath.startsWith("/admin"))) {
    // Account exists but has no workspace (e.g. interrupted signup). Treat as
    // invalid rather than leaving them signed in with nowhere to land.
    await loginLimiter.recordFailure(limitKey);
    return NextResponse.redirect(
      new URL(`/login?error=invalid&next=${encodeURIComponent(nextPath)}`, destinationOrigin),
      303,
    );
  }

  await loginLimiter.reset(limitKey);
  return NextResponse.redirect(new URL(nextPath, destinationOrigin), 303);
}
