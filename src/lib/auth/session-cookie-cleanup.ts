/**
 * Leftover host-only Supabase session cookies.
 *
 * Before 4 Sep 2026 the session cookies were host-only (admin.linkar.in,
 * app.linkar.in); since then they are written with Domain=linkar.in, and
 * @supabase/ssr cookies live up to 400 days. A browser can hold both and
 * sends both in one Cookie header. Two things then hand auth-js the stale
 * session instead of the fresh one:
 *
 * - @supabase/ssr reads an unchunked `sb-<ref>-auth-token` whenever one
 *   exists, before looking at `.0`, `.1` chunks, so a stale unchunked cookie
 *   shadows a fresh chunked session;
 * - Next keeps one value per cookie name, the last one sent, so a stale
 *   cookie with the same name can replace the fresh one.
 *
 * auth-js then refreshes the stale session with a refresh token that was
 * rotated long ago, gets refresh_token_already_used, and deletes the session
 * with Domain=linkar.in: the fresh shared session goes too.
 *
 * This module picks the session every Supabase client reads out of the raw
 * Cookie header, and builds the deletions that remove leftovers from the
 * browser. What @supabase/ssr would read stands whenever it is a live
 * session. Only when it is expired or does not decode, which is what a
 * leftover looks like, does the freshest session in the header replace it:
 * the expiry inside a cookie is not signed, and script on any sibling
 * *.linkar.in host can add a Domain=linkar.in cookie claiming any expiry, so
 * it must never outrank a session that works. It has no next/headers import,
 * so proxy.ts can use it.
 */

import { sharedAuthCookieDomain } from "@/src/lib/auth/cookie-domain";

export type RequestCookie = { name: string; value: string };

type AuthOrigins = { appUrl: string; adminUrl: string; publicSiteUrl: string };

/** supabase-js's default storage key, which names the session cookies. */
export function supabaseSessionStorageKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

function decodeCookieValue(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Every cookie in a Cookie header, in the order sent, duplicates kept. Names
 * and values are read the way Next's RequestCookies reads them (split on ";",
 * a bare name means "true", a value that does not URI-decode is skipped).
 */
export function parseCookieHeader(header: string): RequestCookie[] {
  const cookies: RequestCookie[] = [];
  for (const pair of header.split(/; */)) {
    if (!pair) continue;
    const splitAt = pair.indexOf("=");
    if (splitAt === -1) {
      cookies.push({ name: pair, value: "true" });
      continue;
    }
    const value = decodeCookieValue(pair.slice(splitAt + 1));
    if (value !== null) cookies.push({ name: pair.slice(0, splitAt), value });
  }
  return cookies;
}

/** One value per name, the last one sent, at the first one's position: what Next keeps. */
function asNextSeesThem(cookies: RequestCookie[]): RequestCookie[] {
  const byName = new Map<string, RequestCookie>();
  for (const cookie of cookies) byName.set(cookie.name, { name: cookie.name, value: cookie.value });
  return [...byName.values()];
}

/** The chunk index of a session cookie name: -1 for the unchunked cookie, null for any other cookie. */
function sessionCookieIndex(name: string, storageKey: string): number | null {
  if (name === storageKey) return -1;
  if (!name.startsWith(`${storageKey}.`)) return null;
  const suffix = name.slice(storageKey.length + 1);
  return /^(0|[1-9][0-9]*)$/.test(suffix) ? Number(suffix) : null;
}

/** Every session cookie name in a Cookie header, in the order first sent, whatever its value. */
export function sessionCookieNames(header: string | null | undefined, storageKey: string): string[] {
  if (!header) return [];
  return [...new Set(parseCookieHeader(header).map(({ name }) => name).filter((name) => sessionCookieIndex(name, storageKey) !== null))];
}

const BASE64_PREFIX = "base64-";
const BASE64URL_TEXT = /^[A-Za-z0-9_-]*$/;

/** Unpadded base64url to UTF-8 text, or null when it is not base64url. */
function decodeBase64Url(text: string): string | null {
  if (text.length % 4 === 1 || !BASE64URL_TEXT.test(text)) return null;
  try {
    if (typeof Buffer === "function") return Buffer.from(text, "base64url").toString("utf8");
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * The expiry and user of an access token, read without verifying it. Neither
 * grants anything: the token is still verified by getClaims. They only rank
 * candidate sessions and tell whose they are.
 */
function jwtClaims(token: string): { exp: number | null; sub: string | null } {
  const payload = token.split(".")[1];
  const json = payload === undefined ? null : decodeBase64Url(payload);
  if (json === null) return { exp: null, sub: null };
  try {
    const { exp, sub } = JSON.parse(json) as { exp?: unknown; sub?: unknown };
    return {
      exp: typeof exp === "number" && Number.isFinite(exp) ? exp : null,
      sub: typeof sub === "string" && sub !== "" ? sub : null,
    };
  } catch {
    return { exp: null, sub: null };
  }
}

/** The first `count` characters of the parts joined, without joining them all. */
function leadingText(parts: string[], count: number): string {
  let text = "";
  for (const part of parts) {
    if (text.length >= count) break;
    text += part.slice(0, count - text.length);
  }
  return text;
}

/** The last `count` characters of the parts joined, without joining them all. */
function trailingText(parts: string[], count: number): string {
  let text = "";
  for (let index = parts.length - 1; index >= 0 && text.length < count; index -= 1) text = parts[index].slice(-(count - text.length)) + text;
  return text;
}

/**
 * Characters one selection may join, decode and parse while reading
 * candidate sessions: four times Node's 16 KB header limit, several times
 * what two real sessions need. A Cookie header anyone can craft must not
 * cost more than that.
 */
const MAX_DECODED_CHARS = 64 * 1024;

type Budget = { chars: number };

/** subject: the access token's user (sub), or null when it has none. */
type ReadSession = { freshness: number; value: string; subject: string | null };

/**
 * How fresh the session that `parts` spell is, as its expires_at (the access
 * token's exp when it has none), or null when it is not a session
 * @supabase/ssr could hand to auth-js. Values are read the way @supabase/ssr
 * reads them: "base64-" then base64url JSON, or plain JSON.
 *
 * Checks that read only the first and last few characters run first: a JSON
 * object starts with `{"` and ends with `}`, and base64 decodes four
 * characters at a time, so its first and last groups can be read alone.
 * Whatever passes is charged to the budget before it is joined, decoded and
 * parsed, and is not read once the budget cannot cover it.
 */
function readSession(parts: string[], budget: Budget): ReadSession | null {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const encoded = leadingText(parts, BASE64_PREFIX.length) === BASE64_PREFIX;
  if (encoded) {
    const textLength = length - BASE64_PREFIX.length;
    if (textLength < 4 || textLength % 4 === 1) return null;
    if (!decodeBase64Url(leadingText(parts, BASE64_PREFIX.length + 4).slice(BASE64_PREFIX.length))?.startsWith('{"')) return null;
    if (!decodeBase64Url(trailingText(parts, textLength % 4 || 4))?.endsWith("}")) return null;
  } else if (leadingText(parts, 1) !== "{" || trailingText(parts, 1) !== "}") {
    return null;
  }
  if (length > budget.chars) return null;
  budget.chars -= length;

  const value = parts.join("");
  const json = encoded ? decodeBase64Url(value.slice(BASE64_PREFIX.length)) : value;
  if (json === null) return null;
  let session: unknown;
  try {
    session = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof session !== "object" || session === null) return null;
  const { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt } = session as Record<string, unknown>;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") return null;
  const claims = jwtClaims(accessToken);
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) return { freshness: expiresAt, value, subject: claims.sub };
  return { freshness: claims.exp ?? Number.NEGATIVE_INFINITY, value, subject: claims.sub };
}

/**
 * How fresh a session cookie value is (see readSession), or null when it is
 * not a session @supabase/ssr could hand to auth-js.
 */
export function sessionFreshness(value: string): number | null {
  return readSession([value], { chars: Number.POSITIVE_INFINITY })?.freshness ?? null;
}

/** auth-js refreshes a session this close to its expiry (EXPIRY_MARGIN_MS), so a session inside it is not live. */
const EXPIRY_MARGIN_SECONDS = 90;

/**
 * What @supabase/ssr reads from a cookie list: the unchunked cookie when it
 * has a value, otherwise `.0`, `.1`, ... up to the first one missing or
 * empty, taking the first cookie of each name as its find() does.
 */
function supabaseOwnPick(current: RequestCookie[], storageKey: string): RequestCookie[] {
  const first = new Map<string, RequestCookie>();
  for (const cookie of current) if (!first.has(cookie.name)) first.set(cookie.name, cookie);
  const whole = first.get(storageKey);
  if (whole?.value) return [whole];
  const chunks: RequestCookie[] = [];
  for (let chunk = first.get(`${storageKey}.0`); chunk?.value; chunk = first.get(`${storageKey}.${chunks.length}`)) chunks.push(chunk);
  return chunks;
}

type Occurrence = RequestCookie & { index: number; position: number };

/** paired: built from one cookie, or from the k-th copy of each chunk name, rather than a mix. */
type Candidate = { cookies: RequestCookie[]; freshness: number; value: string; subject: string | null; paired: boolean; latest: number };

/**
 * Bounds on the work one request can cause. A real session is a handful of
 * chunks and a browser sends each name at most a few times.
 */
const MAX_SESSION_CHUNKS = 16;
const MAX_CHUNK_COMBINATIONS = 64;
/** Copies of one session cookie name that are read, the last ones sent (Next keeps the last). */
const MAX_COPIES_PER_NAME = 8;

/**
 * Every session the occurrences can spell: each unchunked cookie on its own,
 * and each run of chunks `.0` ... `.n-1` built from one occurrence of each
 * chunk name. When a stale and a fresh session were both chunked, every
 * chunk name can appear twice and the two sessions need not have as many
 * chunks, so the runs pair occurrences in order first (the k-th `.0` with the
 * k-th `.1`), then try the other combinations up to a cap. A combination of
 * chunks from different sessions almost never decodes; when one does (the
 * fresh session's first chunk carries its tokens, and the stale session's
 * tail can happen to line up), it ties with the real session and the in-order
 * pairing wins.
 */
function sessionCandidates(occurrences: Occurrence[], budget: Budget): Candidate[] {
  const candidates: Candidate[] = [];
  const consider = (cookies: Occurrence[], paired: boolean) => {
    const session = readSession(cookies.map(({ value }) => value), budget);
    if (session === null) return;
    candidates.push({
      cookies: cookies.map(({ name, value }) => ({ name, value })),
      ...session,
      paired,
      latest: Math.max(...cookies.map(({ position }) => position)),
    });
  };

  for (const occurrence of occurrences) if (occurrence.index === -1) consider([occurrence], true);

  const chunks: Occurrence[][] = [];
  for (let index = 0; index < MAX_SESSION_CHUNKS; index += 1) {
    const sent = occurrences.filter((occurrence) => occurrence.index === index);
    if (sent.length === 0) break;
    chunks.push(sent);
  }

  const tried = new Set<string>();
  let tries = MAX_CHUNK_COMBINATIONS;
  const tryRun = (choice: number[], paired: boolean) => {
    const key = choice.join(",");
    if (tried.has(key) || tries <= 0) return;
    tried.add(key);
    tries -= 1;
    consider(choice.map((pick, index) => chunks[index][pick]), paired);
  };
  for (let length = 1; length <= chunks.length && tries > 0; length += 1) {
    const deepest = Math.max(...chunks.slice(0, length).map((sent) => sent.length));
    for (let k = 0; k < deepest && tries > 0; k += 1) tryRun(chunks.slice(0, length).map((sent) => Math.min(k, sent.length - 1)), true);
  }
  for (let length = 1; length <= chunks.length && tries > 0; length += 1) {
    const choice = new Array<number>(length).fill(0);
    for (;;) {
      tryRun(choice, false);
      let digit = length - 1;
      while (digit >= 0 && choice[digit] === chunks[digit].length - 1) {
        choice[digit] = 0;
        digit -= 1;
      }
      if (digit < 0 || tries <= 0) break;
      choice[digit] += 1;
    }
  }
  return candidates;
}

export type SessionCookieSelection = {
  /** The cookies a Supabase client should read: every other cookie, and only the chosen session's cookies. */
  cookies: RequestCookie[];
  /** More than one session, or session cookies the chosen session does not use: the browser holds leftovers. */
  conflict: boolean;
  /** Every session cookie name the request carried. */
  authCookieNames: string[];
  /**
   * Chunks past the end of the session that is read, when the request sent
   * one cookie of each session cookie name and no unchunked cookie beside
   * the chunks. No session can use them, whatever their scope, so they are
   * deleted at the session cookies' own scope.
   */
  strayCookieNames: string[];
  /**
   * Set when the chosen session is not the one @supabase/ssr would read: the
   * user it must belong to, as named in the session @supabase/ssr would read.
   * That name is not verified here, so whoever runs the session check must
   * compare it with the user Supabase verifies, and on a mismatch keep none
   * of the check's cookie writes and treat the request as signed out.
   */
  replacedFor: string | null;
};

/** A selection without its cookie list: `chosen` replaces the store's session cookies, or null to read the store as it is. */
type SessionCookieDecision = Omit<SessionCookieSelection, "cookies"> & { chosen: RequestCookie[] | null };

function decideSessionCookies(storageKey: string, sent: RequestCookie[] | null, current: RequestCookie[]): SessionCookieDecision {
  const isSessionCookie = (cookie: RequestCookie) => sessionCookieIndex(cookie.name, storageKey) !== null;

  let pairs: RequestCookie[] = sent ?? current;
  if (sent) {
    const sentValues = new Map(asNextSeesThem(sent).map(({ name, value }) => [name, value]));
    const storeValues = new Map(current.map(({ name, value }) => [name, value]));
    const rewritten = new Set([...sentValues.keys(), ...storeValues.keys()].filter((name) => sessionCookieIndex(name, storageKey) !== null && sentValues.get(name) !== storeValues.get(name)));
    if (rewritten.size > 0) {
      pairs = [];
      const placed = new Set<string>();
      const place = (name: string) => {
        if (placed.has(name)) return;
        placed.add(name);
        const value = storeValues.get(name);
        if (value) pairs.push({ name, value });
      };
      for (const cookie of sent) {
        if (rewritten.has(cookie.name)) place(cookie.name);
        else pairs.push(cookie);
      }
      for (const name of rewritten) place(name);
    }
  }

  const occurrences: Occurrence[] = [];
  pairs.forEach((cookie, position) => {
    const index = sessionCookieIndex(cookie.name, storageKey);
    if (index !== null && cookie.value) occurrences.push({ ...cookie, index, position });
  });
  // A browser sends a name a few times at most; a crafted header can send it
  // thousands of times. Read only the last copies of each name.
  const copiesLeft = new Map<string, number>();
  for (let i = occurrences.length - 1; i >= 0; i -= 1) {
    const left = copiesLeft.get(occurrences[i].name) ?? MAX_COPIES_PER_NAME;
    if (left <= 0) occurrences.splice(i, 1);
    else copiesLeft.set(occurrences[i].name, left - 1);
  }
  const authCookieNames = [...new Set([...(sent ?? []), ...current].filter(isSessionCookie).map(({ name }) => name))];
  if (occurrences.length === 0) return { chosen: null, conflict: false, authCookieNames, strayCookieNames: [], replacedFor: null };

  const distinct = new Set(occurrences.map(({ name }) => name)).size === occurrences.length;
  const mixed = occurrences.some(({ index }) => index === -1) && occurrences.some(({ index }) => index !== -1);
  const strayCookieNames = (read: RequestCookie[]) => {
    if (!distinct || mixed || read.length === 0 || read[0].name === storageKey) return [];
    const used = new Set(read.map(({ name }) => name));
    return occurrences.filter(({ name }) => !used.has(name)).map(({ name }) => name);
  };

  const budget: Budget = { chars: MAX_DECODED_CHARS };
  const own = supabaseOwnPick(current, storageKey);
  const ownSession = own.length > 0 ? readSession(own.map(({ value }) => value), budget) : null;
  // What @supabase/ssr reads stands while it is live, or when it is the only
  // session the request can spell (one cookie of each name, no unchunked
  // cookie beside chunks). The browser may still hold other session cookies
  // beside it: they are still cleaned up, and the client is handed only the
  // cookies it reads, so the deletions auth-js asks for cannot reach them.
  if (ownSession && (ownSession.freshness - Date.now() / 1000 >= EXPIRY_MARGIN_SECONDS || (distinct && !mixed))) {
    const conflict = occurrences.length > own.length;
    return { chosen: conflict ? own : null, conflict, authCookieNames, strayCookieNames: strayCookieNames(own), replacedFor: null };
  }

  // Only a session of the same person may replace what @supabase/ssr reads:
  // a leftover is always the person's own older session, while a cookie added
  // from another linkar.in host would be someone else's. When the own pick
  // names no user, every candidate must name the same one. Otherwise the
  // store's view stands, as it did before this cleanup existed.
  const candidates = sessionCandidates(occurrences, budget);
  const sessionsSent = new Set(candidates.map(({ value }) => value)).size;
  const subjects = new Set(candidates.map(({ subject }) => subject));
  const owner = ownSession?.subject ?? (subjects.size === 1 ? [...subjects][0] : null);
  const eligible = owner === null ? [] : candidates.filter(({ subject }) => subject === owner);

  // Freshest first; on a tie an in-order pairing, then the copy sent last.
  const better = (a: Candidate, b: Candidate) => a.freshness !== b.freshness ? a.freshness > b.freshness : a.paired !== b.paired ? a.paired : a.latest > b.latest;
  let chosen: Candidate | null = null;
  for (const candidate of eligible) if (!chosen || better(candidate, chosen)) chosen = candidate;
  if (!chosen) return { chosen: null, conflict: !distinct || sessionsSent > 1, authCookieNames, strayCookieNames: [], replacedFor: null };

  const conflict = sessionsSent > 1 || occurrences.length > chosen.cookies.length;
  if (!conflict) return { chosen: null, conflict, authCookieNames, strayCookieNames: [], replacedFor: null };
  const replaced = ownSession === null || chosen.value !== ownSession.value;
  return { chosen: chosen.cookies, conflict, authCookieNames, strayCookieNames: strayCookieNames(chosen.cookies), replacedFor: replaced ? owner : null };
}

function applyDecision({ chosen, ...decision }: SessionCookieDecision, current: RequestCookie[], storageKey: string): SessionCookieSelection {
  if (!chosen) return { ...decision, cookies: current };
  return { ...decision, cookies: [...current.filter((cookie) => sessionCookieIndex(cookie.name, storageKey) === null), ...chosen] };
}

/**
 * The cookies Supabase should read for a request.
 *
 * `header` is the raw Cookie header (null when it cannot be read), the only
 * place duplicate names survive. `current` is the cookie store's view
 * (request.cookies or next/headers cookies()), which also holds cookies
 * written during this request: the proxy's refreshed session, or a route
 * handler's earlier write. Where the store disagrees with the header about a
 * session cookie, the store's value replaces every copy the header sent.
 *
 * What @supabase/ssr would read from the store comes back unchanged while it
 * is a live session, and when nothing else in the request could be one.
 * Otherwise the freshest session that decodes is chosen; if none decodes,
 * the store's view comes back unchanged too.
 */
export function selectSessionCookies(input: { storageKey: string; header: string | null | undefined; current?: RequestCookie[] }): SessionCookieSelection {
  const sent = input.header ? parseCookieHeader(input.header) : null;
  const current = input.current ?? asNextSeesThem(sent ?? []);
  return applyDecision(decideSessionCookies(input.storageKey, sent, current), current, input.storageKey);
}

function sameCookies(a: RequestCookie[], b: RequestCookie[]): boolean {
  return a.length === b.length && a.every((cookie, index) => cookie.name === b[index].name && cookie.value === b[index].value);
}

/**
 * selectSessionCookies for one request, as a getAll for a Supabase client.
 * @supabase/ssr calls getAll several times per client, and the choice
 * changes only when the store's session cookies do (a write during the
 * request), so it is made once and made again only then. The rest of the
 * cookie list is read from the store on every call.
 */
export function sessionCookieSelector(storageKey: string, header: string | null | undefined): (current: RequestCookie[]) => SessionCookieSelection {
  const sent = header ? parseCookieHeader(header) : null;
  let decidedFor: RequestCookie[] | null = null;
  let decision: SessionCookieDecision | null = null;
  return (current) => {
    const sessionPart = current.filter((cookie) => sessionCookieIndex(cookie.name, storageKey) !== null);
    if (!decision || !decidedFor || !sameCookies(decidedFor, sessionPart)) {
      decision = decideSessionCookies(storageKey, sent, current);
      decidedFor = sessionPart;
    }
    return applyDecision(decision, current, storageKey);
  };
}

/** Set-Cookie values that delete the named cookies, on the responding host only unless `domain` is given. */
function sessionCookieDeletions(names: readonly string[], options: { secure: boolean; domain?: string }): string[] {
  return names.map((name) => [
    `${name}=`,
    ...(options.domain ? [`Domain=${options.domain}`] : []),
    "Path=/",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
    ...(options.secure ? ["Secure"] : []),
  ].join("; "));
}

/**
 * Set-Cookie values that delete the named cookies on the responding host
 * only. Without a Domain attribute they match only host-only cookies, so a
 * cookie written with Domain=linkar.in is left alone.
 */
export function hostOnlyCookieDeletions(names: readonly string[], options: { secure: boolean }): string[] {
  return sessionCookieDeletions(names, { secure: options.secure });
}

/**
 * The deletions a response carries to clean up after the session cookies a
 * request sent:
 *
 * - stray chunks (SessionCookieSelection.strayCookieNames) are deleted at
 *   the session cookies' own scope, unless this response writes that name;
 * - where the session cookies are shared across subdomains (production),
 *   every session cookie name the request carried is deleted host-only on
 *   an app or admin host when the request shows a leftover, or when the
 *   response changes one of those cookies (`written`: auth-js refreshed or
 *   removed the session, and the response passes that on). In that setup a
 *   host-only session cookie on a subdomain is always a leftover, so these
 *   deletions never touch the real session. Never in local development,
 *   where host-only cookies are the real session; and never from the shared
 *   domain itself (linkar.in), where a host-only cookie and a
 *   Domain=linkar.in cookie share a domain and a browser following the
 *   original cookie RFC would treat them as the same.
 */
export function leftoverSessionCookieDeletions(input: {
  origins: AuthOrigins;
  hostname: string;
  selection: SessionCookieSelection;
  written?: ReadonlySet<string>;
}): string[] {
  const { origins, selection, written = new Set<string>() } = input;
  const secure = new URL(origins.appUrl).protocol === "https:";
  const sharedDomain = sharedAuthCookieDomain(origins);
  const deletions = sessionCookieDeletions(selection.strayCookieNames.filter((name) => !written.has(name)), { secure, domain: sharedDomain });
  if (!sharedDomain || selection.authCookieNames.length === 0) return deletions;
  const host = input.hostname.toLowerCase().replace(/:\d+$/, "");
  if (!host.endsWith(`.${sharedDomain}`)) return deletions;
  const changed = selection.authCookieNames.some((name) => written.has(name));
  if (selection.conflict || changed) deletions.push(...hostOnlyCookieDeletions(selection.authCookieNames, { secure }));
  return deletions;
}
