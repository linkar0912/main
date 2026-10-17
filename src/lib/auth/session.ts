import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { supabaseAuthCookieOptions } from "@/src/lib/auth/cookie-domain";
import { requestSessionCookies } from "@/src/lib/auth/request-session-cookies";
import { getServerEnv } from "@/src/lib/env";
import { SessionCheckDeadlineError, createSessionCheck } from "@/src/lib/supabase/session-check";
import { getRepository } from "../repository-provider";
import { cache } from "react";
import type { AutomationRepository } from "../repository";

export type AppSession = {
  userId: string;
  email: string;
  workspaceId: string;
};

export type ApplicationSessionValidationInput = AppSession & {
  claims: Record<string, unknown>;
};

export type GetValidatedSessionOptions = {
  validateApplicationSession?: (
    input: ApplicationSessionValidationInput,
  ) => boolean | Promise<boolean>;
};

type ApplicationAccessRepository = Pick<
  AutomationRepository,
  "getSessionAccessSnapshot" | "findWorkspaceIdByMemberEmail" | "bindMemberUserId" | "getApplicationAccessState"
>;

export async function assertApplicationAccess(
  userId: string,
  email: string,
  issuedAt: number | null,
  repository: ApplicationAccessRepository = getRepository(),
): Promise<{ workspaceId: string; email: string } | null> {
  const normalizedEmail = email.trim().toLowerCase();
  // Fast path: one snapshot call (membership + workspace status + platform
  // control flags, two queries in parallel) covers users with a bound member
  // row - which is every request after first login.
  const snapshot = await repository.getSessionAccessSnapshot(userId);

  let workspaceId: string;
  let memberEmail: string;
  let access: { userStatus: string; workspaceStatus: string; sessionInvalidBefore: string | null } | null;

  if (snapshot) {
    workspaceId = snapshot.workspaceId;
    memberEmail = snapshot.email;
    access = snapshot;
  } else {
    // Backfill path: a member row that predates userId binding. Claim it once,
    // then the fast path serves every later request.
    const foundWorkspaceId = await repository.findWorkspaceIdByMemberEmail(normalizedEmail);
    if (!foundWorkspaceId) return null;
    const bound = await repository.bindMemberUserId(foundWorkspaceId, normalizedEmail, userId);
    if (!bound) return null;
    workspaceId = foundWorkspaceId;
    memberEmail = normalizedEmail;
    access = await repository.getApplicationAccessState(userId, workspaceId);
  }

  if (!access || access.userStatus !== "ACTIVE" || access.workspaceStatus !== "ACTIVE") return null;
  if (access.sessionInvalidBefore) {
    if (issuedAt === null || issuedAt * 1000 < Date.parse(access.sessionInvalidBefore)) return null;
  }
  return { workspaceId, email: memberEmail.toLowerCase() };
}

type SessionClaims = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createServerClient>["auth"]["getClaims"]>>["data"]
>["claims"];

type CookiesToSet = Parameters<SetAllCookies>[0];

/** authUnavailable: Supabase Auth could not answer, so "no session" may be wrong. */
type ClaimsCheck = { claims: SessionClaims; authUnavailable: false } | { claims: null; authUnavailable: boolean };

/**
 * The verified claims of the request's Supabase session, or null claims when
 * there is no usable session. getClaims() could wait out auth-js's
 * token-refresh retries (about 25 s) while Supabase Auth is failing, so the
 * client uses the session check's fetch: the check gives up after two 5xx
 * answers in a row to a refresh, or after 10 s, and either way aborts every
 * later attempt, so a refresh cannot rotate the token after the route has
 * answered. A check that cannot finish is treated like a retryable error from
 * getClaims() always was: no session, so routes answer 401.
 *
 * Cookie writes wait until the check settles. Supabase's rate limit on token
 * refreshes counts this server's address, which every signed-in user shares,
 * so a 429 says nothing about this session; auth-js still removes the session
 * on it, and its cookie deletions (empty values) are dropped so the person is
 * not signed out. Cookies with a value, such as a rotated session, are kept.
 *
 * When the browser also sent a leftover host-only session, the client reads
 * the freshest one (request-session-cookies.ts) instead of refreshing the
 * stale one and deleting both.
 */
async function checkSessionClaims(): Promise<ClaimsCheck> {
  const env = getServerEnv();
  const { cookieStore, getAll, replacedFor } = await requestSessionCookies(env.supabaseUrl);
  const writeCookies = (cookiesToSet: CookiesToSet) => {
    try {
      for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
    } catch {
      // Called during a Server Component render, where the cookie store is
      // read-only; proxy.ts refreshes the session for that path instead.
    }
  };
  const pending: CookiesToSet = [];
  let settled = false;
  const sessionCheck = createSessionCheck();
  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookieOptions: supabaseAuthCookieOptions(env),
    global: { fetch: sessionCheck.fetch },
    cookies: {
      getAll,
      setAll: (cookiesToSet) => {
        if (settled) writeCookies(cookiesToSet);
        else pending.push(...cookiesToSet);
      },
    },
  });

  let check: ClaimsCheck;
  let rateLimited = false;
  // A swapped-in session that does not verify as the person it was chosen
  // for: none of the check's writes may reach the browser.
  let discardWrites = false;
  try {
    const { data, error } = await sessionCheck.run(supabase.auth.getClaims());
    rateLimited = Boolean(error && isAuthApiError(error) && error.status === 429);
    if (replacedFor !== null && (error || data?.claims?.sub !== replacedFor)) {
      discardWrites = true;
      check = { claims: null, authUnavailable: Boolean(error && (rateLimited || isAuthRetryableFetchError(error))) };
    } else if (error && (rateLimited || isAuthRetryableFetchError(error))) check = { claims: null, authUnavailable: true };
    else if (error || !data?.claims?.sub || !data.claims.email) check = { claims: null, authUnavailable: false };
    else check = { claims: data.claims, authUnavailable: false };
  } catch (error) {
    if (!(error instanceof SessionCheckDeadlineError || isAuthRetryableFetchError(error))) throw error;
    discardWrites = replacedFor !== null;
    check = { claims: null, authUnavailable: true };
  } finally {
    settled = true;
    if (!discardWrites) writeCookies(rateLimited ? pending.filter((cookie) => cookie.value) : pending);
  }
  return check;
}

/**
 * Verifies the Supabase session cookie and resolves it to this app's
 * {userId, workspaceId} shape. getClaims() verifies the JWT locally against
 * the project's cached JWKS (no network round-trip) since the project uses
 * asymmetric signing keys, refreshing first if the access token is close to
 * expiry. workspaceId is derived per-request from team membership (keyed by
 * email) rather than embedded in the token, since Supabase doesn't expose a
 * custom session claim shape without extra setup.
 *
 * authUnavailable says Supabase Auth could not answer, so a null session may
 * be wrong: a route can then say "try again shortly" instead of sending the
 * person to sign in.
 *
 * The `_request` parameter is reserved for symmetry with how route handlers
 * are typed (`(request: Request, context) => …`) and so a future change to
 * pull additional context (IP-bound rate limiting, request-scoped caches,
 * etc.) doesn't need to update every call site. It is intentionally unused
 * today - cookie reads happen via next/headers in checkSessionClaims().
 */
export async function checkValidatedSession(
  _request: Request,
  options: GetValidatedSessionOptions = {},
): Promise<RequestSessionCheck> {
  const { claims, authUnavailable } = await checkSessionClaims();
  if (!claims) return { session: null, authUnavailable };

  const userId = String(claims.sub);
  const email = String(claims.email);
  const issuedAt = typeof claims.iat === "number" ? claims.iat : null;
  const access = await assertApplicationAccess(userId, email, issuedAt);
  if (!access) return { session: null, authUnavailable: false };

  const session = { userId, email: access.email, workspaceId: access.workspaceId };
  const allowed = await (options.validateApplicationSession?.({
    ...session,
    claims: claims as Record<string, unknown>,
  }) ?? true);

  return { session: allowed ? session : null, authUnavailable: false };
}

/** checkValidatedSession's session alone: null when there is none, for whatever reason. */
export async function getValidatedSession(
  request: Request,
  options: GetValidatedSessionOptions = {},
): Promise<AppSession | null> {
  return (await checkValidatedSession(request, options)).session;
}

export type RequestSessionCheck = {
  session: AppSession | null;
  /** Supabase Auth could not answer (a 5xx, a 429, no answer in time), so a null session may be wrong. */
  authUnavailable: boolean;
};

/**
 * Request-scoped session resolution for Server Components (pages, layouts).
 * React cache() dedupes every call within one RSC render pass, so a layout
 * and its page can both ask for the session without repeating the Supabase
 * JWT verification and the access-state database queries.
 *
 * Route handlers must keep using getValidatedSession (or checkValidatedSession): cache() scopes to the
 * React render pass and offers no dedupe guarantees outside one, and the
 * options hook (validateApplicationSession) is a route-handler concern.
 */
const resolveRequestSession = cache(async (): Promise<RequestSessionCheck> => {
  const { claims, authUnavailable } = await checkSessionClaims();
  if (!claims) return { session: null, authUnavailable };

  const userId = String(claims.sub);
  const email = String(claims.email);
  const issuedAt = typeof claims.iat === "number" ? claims.iat : null;
  const access = await assertApplicationAccess(userId, email, issuedAt);
  return {
    session: access ? { userId, email: access.email, workspaceId: access.workspaceId } : null,
    authUnavailable: false,
  };
});

export async function getRequestSession(): Promise<AppSession | null> {
  return (await resolveRequestSession()).session;
}

/**
 * getRequestSession, plus whether Supabase Auth could not answer. For the
 * sign-in page, which tells the person that signing in may not work yet.
 */
export function checkRequestSession(): Promise<RequestSessionCheck> {
  return resolveRequestSession();
}

/**
 * The instant to store as sessionInvalidBefore when revoking a user's
 * sessions. JWT `iat` has one-second resolution and assertApplicationAccess
 * rejects `iat * 1000 < sessionInvalidBefore`, so the instant is floored to
 * the second: otherwise a sign-in completed later within the same second as
 * the revocation would be rejected too.
 */
export function sessionRevocationInstant(now = Date.now()): string {
  return new Date(Math.floor(now / 1_000) * 1_000).toISOString();
}

function hasBackslashOrControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || value[i] === "\\") return true;
  }
  return false;
}

export function safeNextPath(value: string | null | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") && !hasBackslashOrControlChar(value)
    ? value
    : "/dashboard";
}
