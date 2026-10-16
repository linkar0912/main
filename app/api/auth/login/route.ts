import { NextResponse } from "next/server";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { safeNextPath } from "@/src/lib/auth/session";
import { LoginRateLimitStore, loginRateLimitKey, networkRateLimitKey } from "@/src/lib/auth/rate-limit";
import { clientAddress } from "@/src/lib/auth/client-address";
import { authPageUrl, sanitizeInvite } from "@/src/lib/auth/auth-redirect";
import { completeOAuthSignIn } from "@/src/lib/auth/complete-oauth-signin";
import { pendingInviteFromUser } from "@/src/lib/auth/invitations";
import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import { getRepository } from "@/src/lib/repository-provider";
import { rejectCrossSiteRequest } from "@/src/lib/security/same-origin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { applicationOriginForPath } from "@/src/lib/site-routing";

export const runtime = "nodejs";

// Per (email, network): the classic lockout. Per network: a cap across every
// email, so one source cannot spray guesses at many accounts - and because
// the per-email bucket is also keyed by network, an attacker elsewhere cannot
// lock a victim out of their own account.
let loginLimiter: LoginRateLimitStore | undefined;
let networkLimiter: LoginRateLimitStore | undefined;
const NETWORK_ATTEMPTS_PER_WINDOW = 100;

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteRequest(request);
  if (crossSite) return crossSite;

  const env = getServerEnv();
  loginLimiter ??= new LoginRateLimitStore(env.redisUrl);
  networkLimiter ??= new LoginRateLimitStore(env.redisUrl, NETWORK_ATTEMPTS_PER_WINDOW);
  const address = clientAddress(request, env.trustedProxyHops);
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const nextPath = safeNextPath(String(form.get("next") ?? "/dashboard"));
  const invite = sanitizeInvite(String(form.get("invite") ?? ""));
  const destinationOrigin = applicationOriginForPath(nextPath, env);
  const backToLogin = (error: string, extra: { email?: string } = {}) =>
    NextResponse.redirect(authPageUrl("/login", { error, next: nextPath, invite, ...extra }, destinationOrigin), 303);

  // Both limits count the attempt atomically before the password is checked,
  // so concurrent guesses cannot all pass a stale read of the counter.
  const networkKey = networkRateLimitKey(env.authSessionSecret, "login", address);
  if (networkKey && !(await networkLimiter.consume(networkKey))) return backToLogin("locked");
  const limitKey = loginRateLimitKey(env.authSessionSecret, email || "-", address);
  if (!(await loginLimiter.consume(limitKey))) return backToLogin("locked");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Supabase only reports this after the password matched, so naming it
    // reveals nothing a correct password does not already prove.
    if (error.code === "email_not_confirmed") return backToLogin("unconfirmed", { email });
    // Neither of these checked the password, so do not call it wrong. The
    // attempt still counts toward the limits above: an outage must not hand
    // out free guesses. Supabase's rate limit counts this server's address,
    // which every visitor shares.
    if (error.code === "over_request_rate_limit" || error.status === 429) {
      logger.warn("Supabase Auth rate limited sign-in", { status: error.status, code: error.code });
      return backToLogin("unavailable");
    }
    if (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500) {
      logger.warn("Supabase Auth unavailable at sign-in", { status: error.status });
      return backToLogin("unavailable");
    }
    return backToLogin("invalid");
  }

  const repository = getRepository();
  const userId = data.user?.id;
  const platformOwner = Boolean(userId && env.platformOwnerUserIds.includes(userId.toLowerCase()));
  const ownerConsoleOnly = platformOwner && nextPath.startsWith("/admin");
  let workspaceId: string | null;
  try {
    workspaceId = await repository.findWorkspaceIdByMemberEmail(email);
  } catch (lookupError) {
    // The database failing is not a wrong password. Sign the new session
    // out, since nothing could check where it should land.
    logger.error("Workspace lookup at sign-in failed", {
      error: lookupError instanceof Error ? lookupError.message : String(lookupError),
    });
    await supabase.auth.signOut({ scope: "local" });
    return backToLogin("unavailable");
  }
  if (!workspaceId && !ownerConsoleOnly && userId) {
    // Workspaces are provisioned once the email is verified (here, at the
    // first successful password sign-in, or at /auth/confirm), never at
    // signup. This also accepts a pending invitation for the account.
    try {
      workspaceId = await completeOAuthSignIn({
        email,
        userId,
        inviteRaw: invite || pendingInviteFromUser(data.user),
        repository,
      });
    } catch (provisionError) {
      // completeOAuthSignIn has no business-rule throws: an invalid or used
      // invite falls through to a fresh workspace, and a lost race to accept
      // one or to bind a member returns without throwing. A throw is the
      // database failing, so ask the person to try again.
      logger.error("Workspace provisioning at sign-in failed", {
        error: provisionError instanceof Error ? provisionError.message : String(provisionError),
      });
      await supabase.auth.signOut({ scope: "local" });
      return backToLogin("unavailable");
    }
  }
  if (!workspaceId && !ownerConsoleOnly) {
    // Never leave a session behind for an account with nowhere to land.
    await supabase.auth.signOut({ scope: "local" });
    return backToLogin("invalid");
  }

  await loginLimiter.reset(limitKey);
  return NextResponse.redirect(new URL(nextPath, destinationOrigin), 303);
}
