import { NextResponse } from "next/server";
import {
  createSessionToken,
  sessionCookieName,
  safeNextPath,
  verifyPassword,
} from "@/src/lib/auth/session";
import { LoginRateLimitStore, loginRateLimitKey } from "@/src/lib/auth/rate-limit";
import { clientAddress } from "@/src/lib/auth/client-address";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

let loginLimiter: LoginRateLimitStore | undefined;

export async function POST(request: Request) {
  const env = getServerEnv();
  const repository = getRepository();
  loginLimiter ??= new LoginRateLimitStore(env.redisUrl);
  const address = clientAddress(request, env.trustedProxyHops);
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const nextPath = safeNextPath(String(form.get("next") ?? "/dashboard"));

  const limitKey = loginRateLimitKey(env.authSessionSecret, email || "-", address);
  if (!(await loginLimiter.isAllowed(limitKey))) {
    return NextResponse.redirect(new URL("/login?error=locked", env.appUrl), 303);
  }

  const user = email ? await repository.findUserByEmail(email) : null;
  const passwordValid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !passwordValid) {
    await loginLimiter.recordFailure(limitKey);
    const url = new URL("/login", env.appUrl);
    url.searchParams.set("error", "invalid");
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url, 303);
  }

  const workspaceId = await repository.findWorkspaceIdByMemberEmail(user.email);
  if (!workspaceId) {
    // Account exists but has no workspace (e.g. interrupted signup). Treat as
    // invalid rather than crashing; the user can sign up again with the same
    // email once the orphaned row is cleaned up, or contact support.
    await loginLimiter.recordFailure(limitKey);
    return NextResponse.redirect(
      new URL(`/login?error=invalid&next=${encodeURIComponent(nextPath)}`, env.appUrl),
      303,
    );
  }

  await loginLimiter.reset(limitKey);
  const response = NextResponse.redirect(new URL(nextPath, env.appUrl), 303);
  response.cookies.set({
    name: sessionCookieName(env.appUrl),
    value: createSessionToken({ userId: user.id, workspaceId, ver: user.tokenVersion }, env.authSessionSecret),
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https://"),
    maxAge: 24 * 60 * 60,
    path: "/",
  });
  return response;
}
