import { NextResponse } from "next/server";
import {
  createOwnerSessionToken,
  getOwnerAuthConfig,
  ownerSessionCookieName,
  safeNextPath,
  verifyOwnerPassword,
} from "@/src/lib/auth/session";
import { LoginRateLimitStore, loginRateLimitKey } from "@/src/lib/auth/rate-limit";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

let loginLimiter: LoginRateLimitStore | undefined;

function clientAddress(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

export async function POST(request: Request) {
  const config = getOwnerAuthConfig();
  const env = getServerEnv();
  loginLimiter ??= new LoginRateLimitStore(env.redisUrl);
  const address = clientAddress(request);
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const nextPath = safeNextPath(String(form.get("next") ?? "/"));

  if (!config) {
    return NextResponse.redirect(new URL("/login?error=not-configured", env.appUrl), 303);
  }
  const limitKey = loginRateLimitKey(config.sessionSecret, config.email, address);
  if (!(await loginLimiter.isAllowed(limitKey))) {
    return NextResponse.redirect(new URL("/login?error=locked", env.appUrl), 303);
  }
  const passwordValid = verifyOwnerPassword(password, config.passwordHash);
  if (email !== config.email || !passwordValid) {
    await loginLimiter.recordFailure(limitKey);
    const url = new URL("/login", env.appUrl);
    url.searchParams.set("error", "invalid");
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url, 303);
  }

  await loginLimiter.reset(limitKey);
  await getRepository().ensureWorkspace(config.workspaceId, config.email);
  const response = NextResponse.redirect(new URL(nextPath, env.appUrl), 303);
  response.cookies.set({
    name: ownerSessionCookieName(env.appUrl),
    value: createOwnerSessionToken({ email: config.email, workspaceId: config.workspaceId }, config.sessionSecret),
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https://"),
    maxAge: 24 * 60 * 60,
    path: "/",
  });
  return response;
}
