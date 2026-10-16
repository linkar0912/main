// This module must not import next/headers, directly or through
// server.ts, so proxy.ts can use it as well as route handlers.
import { AuthRetryableFetchError } from "@supabase/supabase-js";

/**
 * Each Supabase request in the check gives up after this long, the same cap
 * as SUPABASE_FETCH_TIMEOUT_MS in server.ts (which reads next/headers).
 */
export const SESSION_CHECK_FETCH_TIMEOUT_MS = 8_000;

/**
 * Each Supabase call already gives up after 8 s, but auth-js retries a failed
 * token refresh for up to 30 s, so the whole session check gets its own cap.
 */
export const SESSION_CHECK_DEADLINE_MS = 10_000;

/**
 * auth-js retries a 5xx answer to a token refresh with backoff for about
 * 25 s. Two 5xx answers in a row mean Supabase Auth is failing, so the check
 * stops waiting and sends no more refresh requests.
 */
export const REFRESH_FAILURES_BEFORE_GIVING_UP = 2;

export class SessionCheckDeadlineError extends Error {
  constructor(deadlineMs = SESSION_CHECK_DEADLINE_MS) {
    super(`Session check took longer than ${deadlineMs} ms`);
    this.name = "SessionCheckDeadlineError";
  }
}

export type SessionCheck = {
  /** Aborted when the check gives up, so abandoned requests stop at once. */
  signal: AbortSignal;
  /** A fetch for the Supabase client that does the check. */
  fetch: typeof fetch;
  /**
   * Settles with `work`, or rejects once the check gives up: with
   * SessionCheckDeadlineError after the deadline, or with
   * AuthRetryableFetchError after repeated 5xx answers to a token refresh.
   */
  run<T>(work: Promise<T>): Promise<T>;
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

/** One Supabase session check (getClaims) with an overall deadline and a fail-fast on a failing Auth service. */
export function createSessionCheck(options: { deadlineMs?: number; fetchTimeoutMs?: number } = {}): SessionCheck {
  const deadlineMs = options.deadlineMs ?? SESSION_CHECK_DEADLINE_MS;
  const controller = new AbortController();

  let failFast: (error: unknown) => void = () => {};
  const authUnavailable = new Promise<never>((_, reject) => {
    failFast = reject;
  });
  // Nobody may be racing it yet (or ever), so never report it as unhandled.
  authUnavailable.catch(() => {});

  const fetchTimeoutMs = options.fetchTimeoutMs ?? SESSION_CHECK_FETCH_TIMEOUT_MS;
  let refreshFailuresInARow = 0;
  const checkFetch: typeof fetch = async (input, init) => {
    // The per-request timeout, the check's own abort, and any signal auth-js
    // passes: whichever fires first cancels the request.
    const signals = [AbortSignal.timeout(fetchTimeoutMs), controller.signal];
    if (init?.signal) signals.push(init.signal);
    const response = await fetch(input, { ...init, signal: AbortSignal.any(signals) });
    if (requestUrl(input).includes("grant_type=refresh_token")) {
      refreshFailuresInARow = response.status >= 500 ? refreshFailuresInARow + 1 : 0;
      if (refreshFailuresInARow >= REFRESH_FAILURES_BEFORE_GIVING_UP) {
        failFast(new AuthRetryableFetchError(`Supabase Auth answered ${response.status} to a token refresh`, response.status));
        controller.abort();
      }
    }
    return response;
  };

  return {
    signal: controller.signal,
    fetch: checkFetch,
    async run<T>(work: Promise<T>): Promise<T> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // Cancel the abandoned work so auth-js stops sending refresh
          // attempts nobody is waiting for. The fail-fast aborts in `fetch`.
          controller.abort();
          reject(new SessionCheckDeadlineError(deadlineMs));
        }, deadlineMs);
      });
      try {
        return await Promise.race([work, authUnavailable, deadline]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
