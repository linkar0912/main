import { NextResponse } from "next/server";
import {
  createOwnerSessionToken,
  createLoginAttemptLimiter,
  getRequestOrigin,
  getOwnerAuthConfig,
  OWNER_SESSION_COOKIE,
  safeNextPath,
  verifyOwnerPassword,
} from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

const loginLimiter = createLoginAttemptLimiter(5, 15 * 60 * 1_000);

function clientAddress(request: Request): string {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}

export async function POST(request: Request) {
  const config = getOwnerAuthConfig();
  const requestOrigin = getRequestOrigin(request);
  const address = clientAddress(request);
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const nextPath = safeNextPath(String(form.get("next") ?? "/"));

  if (!config) {
    return NextResponse.redirect(new URL("/login?error=not-configured", requestOrigin), 303);
  }
  if (!loginLimiter.isAllowed(address)) {
    return NextResponse.redirect(new URL("/login?error=locked", requestOrigin), 303);
  }
  if (email !== config.email || !verifyOwnerPassword(password, config.passwordHash)) {
    loginLimiter.recordFailure(address);
    const url = new URL("/login", requestOrigin);
    url.searchParams.set("error", "invalid");
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url, 303);
  }

  loginLimiter.reset(address);
  await getRepository().ensureWorkspace(config.workspaceId, config.email);
  const response = NextResponse.redirect(new URL(nextPath, requestOrigin), 303);
  response.cookies.set({
    name: OWNER_SESSION_COOKIE,
    value: createOwnerSessionToken(config, config.sessionSecret),
    httpOnly: true,
    sameSite: "lax",
    secure: requestOrigin.startsWith("https://"),
    maxAge: 24 * 60 * 60,
    path: "/",
  });
  return response;
}
