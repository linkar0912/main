import { describe, expect, it, vi } from "vitest";
import {
  hostOnlyCookieDeletions,
  leftoverSessionCookieDeletions,
  parseCookieHeader,
  selectSessionCookies,
  sessionCookieNames,
  sessionCookieSelector,
  sessionFreshness,
  supabaseSessionStorageKey,
  type SessionCookieSelection,
} from "./session-cookie-cleanup";
import { cookieHeader, encodeSessionCookie, fakeSession, nextRequestCookies, sessionCookies } from "./session-cookie-fixtures";

const KEY = "sb-abcdefgh-auth-token";
const now = Math.floor(Date.now() / 1000);
const stale = fakeSession({ userId: "u1", email: "a@example.com", refreshToken: "rt-stale", expiresAt: now - 86_400 });
const fresh = fakeSession({ userId: "u1", email: "a@example.com", refreshToken: "rt-fresh", expiresAt: now + 3_600 });
const padded = (session: typeof fresh, padding: number) => ({ ...session, user: { ...session.user, user_metadata: { note: "p".repeat(padding) } } });
const THEME = { name: "theme", value: "dark" };

/** Selects from a Cookie header the way proxy.ts does: the raw header plus Next's view of it. */
function select(cookies: { name: string; value: string }[]) {
  return selectSessionCookies({ storageKey: KEY, header: cookieHeader(cookies), current: nextRequestCookies(cookies) });
}

const sessionPart = (selection: SessionCookieSelection) => selection.cookies.filter(({ name }) => name.startsWith(KEY));

describe("supabaseSessionStorageKey", () => {
  it("names the cookies after the first label of the Supabase host, as supabase-js does", () => {
    expect(supabaseSessionStorageKey("https://abcdefgh.supabase.co")).toBe(KEY);
    expect(supabaseSessionStorageKey("http://127.0.0.1:54321")).toBe("sb-127-auth-token");
  });
});

describe("parseCookieHeader", () => {
  it("keeps every cookie in the order sent, duplicates included, decoded as Next decodes them", () => {
    expect(parseCookieHeader("a=1; b=x%20y; a=3;c=4; flag; bad=%E0%A4%A; =empty-name")).toEqual([
      { name: "a", value: "1" },
      { name: "b", value: "x y" },
      { name: "a", value: "3" },
      { name: "c", value: "4" },
      { name: "flag", value: "true" },
      { name: "", value: "empty-name" },
    ]);
  });
});

describe("sessionFreshness", () => {
  it("reads expires_at from a base64url or a plain JSON session, and the token's exp when there is none", () => {
    expect(sessionFreshness(encodeSessionCookie(fresh))).toBe(fresh.expires_at);
    expect(sessionFreshness(JSON.stringify(stale))).toBe(stale.expires_at);
    const { expires_at: _dropped, ...withoutExpiry } = fresh;
    expect(sessionFreshness(encodeSessionCookie(withoutExpiry))).toBe(fresh.expires_at);
  });

  it("rejects values that are not a session @supabase/ssr could hand to auth-js", () => {
    expect(sessionFreshness("base64-!!!")).toBeNull();
    expect(sessionFreshness("base64-")).toBeNull();
    expect(sessionFreshness("not json")).toBeNull();
    expect(sessionFreshness(encodeSessionCookie({ access_token: "x" }))).toBeNull();
    expect(sessionFreshness(encodeSessionCookie(["access", "refresh"]))).toBeNull();
    // Half of a chunked session.
    expect(sessionFreshness(encodeSessionCookie(padded(fresh, 3000)).slice(0, 3180))).toBeNull();
  });
});

describe("selectSessionCookies", () => {
  it("prefers a fresh chunked session over a stale unchunked one, which @supabase/ssr would read first", () => {
    const freshChunks = sessionCookies(KEY, padded(fresh, 3000));
    expect(freshChunks).toHaveLength(2);

    const selection = select([...sessionCookies(KEY, stale), ...freshChunks, THEME]);

    expect(selection.conflict).toBe(true);
    expect(selection.cookies).toEqual([THEME, ...freshChunks]);
    expect(selection.authCookieNames).toEqual([KEY, `${KEY}.0`, `${KEY}.1`]);
  });

  it("prefers a fresh unchunked session over stale chunks", () => {
    const staleChunks = sessionCookies(KEY, padded(stale, 3000));
    const freshCookie = sessionCookies(KEY, fresh);
    expect(freshCookie).toEqual([{ name: KEY, value: expect.any(String) }]);

    for (const cookies of [[...staleChunks, ...freshCookie], [...freshCookie, ...staleChunks]]) {
      const selection = select(cookies);
      expect(selection.conflict).toBe(true);
      expect(sessionPart(selection)).toEqual(freshCookie);
    }
  });

  it("finds the fresh session among duplicate names, whichever copy the browser sends last", () => {
    const staleChunks = sessionCookies(KEY, padded(stale, 3000));
    const freshChunks = sessionCookies(KEY, padded(fresh, 3000));
    expect(staleChunks.map(({ name }) => name)).toEqual(freshChunks.map(({ name }) => name));

    for (const cookies of [[...staleChunks, ...freshChunks], [...freshChunks, ...staleChunks], [staleChunks[0], freshChunks[0], staleChunks[1], freshChunks[1]]]) {
      const selection = select(cookies);
      expect(selection.conflict).toBe(true);
      expect(sessionPart(selection)).toEqual(freshChunks);
    }

    const duplicateUnchunked = select([...sessionCookies(KEY, fresh), ...sessionCookies(KEY, stale)]);
    expect(sessionPart(duplicateUnchunked)).toEqual(sessionCookies(KEY, fresh));
  });

  it("pairs the right chunks when the two sessions have different chunk counts", () => {
    const threeChunks = (session: typeof fresh) => sessionCookies(KEY, padded(session, 5500));
    const twoChunks = (session: typeof fresh) => sessionCookies(KEY, padded(session, 3000));
    expect(threeChunks(stale)).toHaveLength(3);
    expect(twoChunks(fresh)).toHaveLength(2);

    for (const cookies of [[...threeChunks(stale), ...twoChunks(fresh)], [...twoChunks(fresh), ...threeChunks(stale)]]) {
      const selection = select(cookies);
      expect(selection.conflict).toBe(true);
      expect(sessionPart(selection)).toEqual(twoChunks(fresh));
    }
    for (const cookies of [[...twoChunks(stale), ...threeChunks(fresh)], [...threeChunks(fresh), ...twoChunks(stale)]]) {
      expect(sessionPart(select(cookies))).toEqual(threeChunks(fresh));
    }
    // A stray chunk past the end of the only session is a leftover too.
    const stray = select([...twoChunks(fresh), { name: `${KEY}.2`, value: "left-over" }]);
    expect(stray.conflict).toBe(true);
    expect(sessionPart(stray)).toEqual(twoChunks(fresh));
  });

  it("lets a candidate that does not decode lose", () => {
    const freshChunks = sessionCookies(KEY, padded(fresh, 3000));
    for (const junk of ["garbage", "base64-!!!", "base64-e30", encodeURIComponent(JSON.stringify({ access_token: "only" }))]) {
      const selection = select([{ name: KEY, value: decodeURIComponent(junk) }, ...freshChunks]);
      expect(selection.conflict).toBe(true);
      expect(sessionPart(selection)).toEqual(freshChunks);
    }
  });

  it("returns Next's view unchanged when nothing decodes, flagging only duplicate names", () => {
    const distinct = [{ name: KEY, value: "junk" }, { name: `${KEY}.0`, value: "more-junk" }, THEME];
    expect(select(distinct)).toEqual({ cookies: nextRequestCookies(distinct), conflict: false, authCookieNames: [KEY, `${KEY}.0`], strayCookieNames: [], replacedFor: null });

    const duplicated = [{ name: KEY, value: "junk" }, { name: KEY, value: "junk-2" }];
    const selection = select(duplicated);
    expect(selection.conflict).toBe(true);
    expect(selection.cookies).toEqual([{ name: KEY, value: "junk-2" }]);
  });

  it("accepts a session stored as plain JSON", () => {
    const rawFresh = { name: KEY, value: JSON.stringify(fresh) };
    const selection = select([...sessionCookies(KEY, padded(stale, 3000)), rawFresh]);
    expect(sessionPart(selection)).toEqual([rawFresh]);
  });

  it("ranks sessions without expires_at by their access token's exp", () => {
    const { expires_at: _a, ...oldest } = padded(stale, 3000);
    const { expires_at: _b, ...newest } = fresh;
    const selection = select([...sessionCookies(KEY, oldest), ...sessionCookies(KEY, newest)]);
    expect(sessionPart(selection)).toEqual(sessionCookies(KEY, newest));
  });

  it("passes a request with one session through exactly as Next sees it", () => {
    const freshChunks = sessionCookies(KEY, padded(fresh, 3000));
    const cookies = [THEME, freshChunks[0], { name: `${KEY}-code-verifier`, value: "verifier" }, freshChunks[1], { name: "theme", value: "light" }];
    const current = nextRequestCookies(cookies);

    const selection = selectSessionCookies({ storageKey: KEY, header: cookieHeader(cookies), current });

    expect(selection.conflict).toBe(false);
    expect(selection.cookies).toBe(current);
    expect(selection.authCookieNames).toEqual([`${KEY}.0`, `${KEY}.1`]);
    // Without a cookie store, Next's view of the header.
    expect(selectSessionCookies({ storageKey: KEY, header: cookieHeader(cookies) }).cookies).toEqual(current);
  });

  it("ignores names that only look like session cookies", () => {
    const lookalikes = [`${KEY}-code-verifier`, `${KEY}.01`, `${KEY}.x`, `${KEY}.`, `x${KEY}`].map((name) => ({ name, value: encodeSessionCookie(stale) }));
    const selection = select([...lookalikes, ...sessionCookies(KEY, fresh)]);
    expect(selection.conflict).toBe(false);
    expect(selection.authCookieNames).toEqual([KEY]);
    expect(selection.cookies).toEqual([...lookalikes, ...sessionCookies(KEY, fresh)]);
  });

  it("ignores chunks that do not start at .0", () => {
    const selection = select([{ name: `${KEY}.1`, value: encodeSessionCookie(fresh) }, THEME]);
    expect(selection.conflict).toBe(false);
    expect(selection.cookies).toEqual([{ name: `${KEY}.1`, value: encodeSessionCookie(fresh) }, THEME]);
  });

  it("uses cookies written during the request, which only the cookie store holds", () => {
    const rotated = padded(fakeSession({ userId: "u1", email: "a@example.com", refreshToken: "rt-rotated", expiresAt: now + 3_500 }), 3000);
    const header = cookieHeader(sessionCookies(KEY, stale));

    // The proxy refreshed and set the rotated session: Next merges it into the
    // store, but the header still holds only what the browser sent.
    const merged = selectSessionCookies({ storageKey: KEY, header, current: [...sessionCookies(KEY, stale), ...sessionCookies(KEY, rotated)] });
    expect(sessionPart(merged)).toEqual(sessionCookies(KEY, rotated));

    // A write replaces every copy the header sent of that name.
    const staleChunks = sessionCookies(KEY, padded(stale, 3000));
    const freshChunks = sessionCookies(KEY, padded(fresh, 3000));
    const rewritten = selectSessionCookies({
      storageKey: KEY,
      header: cookieHeader([...freshChunks, ...staleChunks]),
      current: sessionCookies(KEY, rotated),
    });
    expect(rewritten.conflict).toBe(false);
    expect(sessionPart(rewritten)).toEqual(sessionCookies(KEY, rotated));

    // A deletion (an empty value) removes every copy.
    const deletedStale = selectSessionCookies({
      storageKey: KEY,
      header: cookieHeader([...sessionCookies(KEY, stale), ...freshChunks]),
      current: [{ name: KEY, value: "" }, ...freshChunks],
    });
    expect(deletedStale.conflict).toBe(false);
    expect(deletedStale.authCookieNames).toEqual([KEY, `${KEY}.0`, `${KEY}.1`]);
  });

  it("bounds the work a request full of duplicate chunks can cause", () => {
    const cookies = Array.from({ length: 40 }, (_, copy) => Array.from({ length: 10 }, (_, index) => ({ name: `${KEY}.${index}`, value: `base64-${"A".repeat(200)}${copy}` }))).flat();
    const started = performance.now();

    const selection = select(cookies);

    expect(performance.now() - started).toBeLessThan(500);
    expect(selection.conflict).toBe(true);
    expect(selection.cookies).toEqual(nextRequestCookies(cookies));
  });
});

// Script on any sibling *.linkar.in host cannot overwrite the HttpOnly
// session cookie, but it can add one with Domain=linkar.in and a longer Path,
// which the browser sends first, claiming any expiry. The expiry inside a
// cookie is not signed, so it must not outrank a session that works.
describe("selectSessionCookies with a session cookie added by another host", () => {
  const tossed = fakeSession({ userId: "someone-else", email: "x@example.com", refreshToken: "rt-tossed", expiresAt: 9_999_999_999 });

  it("keeps the session @supabase/ssr reads while it is live, however fresh the other claims to be", () => {
    const victim = sessionCookies(KEY, fresh);
    expect(victim).toEqual([{ name: KEY, value: expect.any(String) }]);
    // The same name sent first (Next keeps the victim's copy, sent last), or
    // chunks beside the victim's unchunked cookie.
    for (const cookies of [[...sessionCookies(KEY, tossed), ...victim], [...sessionCookies(KEY, padded(tossed, 3000)), ...victim]]) {
      const selection = select(cookies);
      expect(sessionPart(selection)).toEqual(victim);
      // Still a leftover, so the host-only cleanup still runs.
      expect(selection.conflict).toBe(true);
      expect(selection.strayCookieNames).toEqual([]);
    }

    const victimChunks = sessionCookies(KEY, padded(fresh, 3000));
    expect(sessionPart(select([...sessionCookies(KEY, padded(tossed, 3000)), ...victimChunks]))).toEqual(victimChunks);
  });

  it("never picks another person's session, even once the person's own has expired", () => {
    // Back after an hour away: the person's own session needs a refresh, and
    // a cookie added from another host claims to last for ever.
    const expired = fakeSession({ userId: "u1", email: "a@example.com", refreshToken: "rt-expired", expiresAt: now - 600 });
    const own = sessionCookies(KEY, expired);
    const ownChunks = sessionCookies(KEY, padded(expired, 3000));
    for (const [cookies, read] of [
      // Same unchunked name, the added copy sent first (Next keeps the last).
      [[...sessionCookies(KEY, tossed), ...own], own],
      // Added chunks beside the person's unchunked cookie, either order.
      [[...sessionCookies(KEY, padded(tossed, 3000)), ...own], own],
      [[...own, ...sessionCookies(KEY, padded(tossed, 3000))], own],
      // Added chunks under the same names as the person's chunks, sent first.
      [[...sessionCookies(KEY, padded(tossed, 3000)), ...ownChunks], ownChunks],
    ] as const) {
      const selection = select([...cookies]);
      expect(sessionPart(selection)).toEqual(read);
      expect(selection.conflict).toBe(true);
    }
    // Not covered here: an added unchunked cookie beside the person's chunks.
    // @supabase/ssr itself reads an unchunked cookie before any chunks, so
    // that case is as it was before this cleanup.
  });

  it("chooses among the sessions only when they all belong to one person if the own pick is unreadable", () => {
    const broken = { name: KEY, value: "base64-not-a-session" };
    const mine = padded(fakeSession({ userId: "u1", email: "a@example.com", refreshToken: "rt-mine", expiresAt: now + 3_600 }), 3000);
    const mineOlder = fakeSession({ userId: "u1", email: "a@example.com", refreshToken: "rt-mine-older", expiresAt: now - 600 });
    // Same person: the freshest of their sessions.
    expect(sessionPart(select([broken, ...sessionCookies(KEY, mineOlder).map((cookie) => ({ ...cookie, name: `${KEY}.0` })), ...sessionCookies(KEY, mine)])))
      .toEqual(sessionCookies(KEY, mine));
    // Two people: nothing is chosen, so Next's view stands.
    const twoPeople = [broken, ...sessionCookies(KEY, padded(tossed, 3000)), ...sessionCookies(KEY, mine)];
    const selection = select(twoPeople);
    expect(sessionPart(selection)).toEqual(sessionPart({ ...selection, cookies: nextRequestCookies(twoPeople) }));
    expect(selection.conflict).toBe(true);
  });

  it("lets a fresher session replace one inside auth-js's 90 second refresh margin", () => {
    const expiring = fakeSession({ userId: "u1", email: "a@example.com", refreshToken: "rt-expiring", expiresAt: now + 60 });
    const later = padded(fakeSession({ userId: "u1", email: "a@example.com", refreshToken: "rt-later", expiresAt: now + 3_600 }), 3000);
    expect(sessionPart(select([...sessionCookies(KEY, expiring), ...sessionCookies(KEY, later)]))).toEqual(sessionCookies(KEY, later));

    const live = fakeSession({ userId: "u1", email: "a@example.com", refreshToken: "rt-live", expiresAt: now + 600 });
    expect(sessionPart(select([...sessionCookies(KEY, live), ...sessionCookies(KEY, later)]))).toEqual(sessionCookies(KEY, live));
  });
});

describe("selectSessionCookies stray chunks", () => {
  const freshChunks = sessionCookies(KEY, padded(fresh, 3000));

  it("names chunks past the end of the only session the request can spell", () => {
    const stray = select([...freshChunks, { name: `${KEY}.2`, value: "left-over" }]);
    expect(sessionPart(stray)).toEqual(freshChunks);
    expect(stray.strayCookieNames).toEqual([`${KEY}.2`]);

    const pastGap = select([...freshChunks, { name: `${KEY}.3`, value: encodeSessionCookie(stale) }]);
    expect(sessionPart(pastGap)).toEqual(freshChunks);
    expect(pastGap.conflict).toBe(true);
    expect(pastGap.strayCookieNames).toEqual([`${KEY}.3`]);
  });

  it("names none when another copy or an unchunked cookie could be a session", () => {
    expect(select(freshChunks).strayCookieNames).toEqual([]);
    expect(select([...sessionCookies(KEY, stale), ...freshChunks]).strayCookieNames).toEqual([]);
    // A three-chunk stale session beside the fresh two-chunk one: `.2` was sent once, but `.0` and `.1` twice.
    expect(select([...sessionCookies(KEY, padded(stale, 5500)), ...freshChunks]).strayCookieNames).toEqual([]);
    expect(select([...sessionCookies(KEY, fresh), { name: `${KEY}.0`, value: "x" }]).strayCookieNames).toEqual([]);
  });
});

describe("selectSessionCookies cost", () => {
  /** A crafted header near Node's 16 KB limit: one large `.0` and many `.1` copies, each ending in a group that decodes to "}". */
  function craftedHeader() {
    const big = `base64-${"eyJh".repeat(2000)}`;
    const tail = `${"QUFB".repeat(25)}${Buffer.from("aa}").toString("base64url")}`;
    const cookies = [{ name: `${KEY}.0`, value: big }];
    while (cookieHeader(cookies).length < 15_500) cookies.push({ name: `${KEY}.1`, value: tail });
    return cookies;
  }

  it("stays well under a millisecond per selection for a crafted 16 KB Cookie header", () => {
    const cookies = craftedHeader();
    const header = cookieHeader(cookies);
    const current = nextRequestCookies(cookies);
    for (let warmUp = 0; warmUp < 5; warmUp += 1) selectSessionCookies({ storageKey: KEY, header, current });

    // The fastest of several batches: the rest of a parallel test run can
    // pause any one batch, but not change what a selection costs.
    const batches = 10;
    const runs = 10;
    let fastest = Number.POSITIVE_INFINITY;
    for (let batch = 0; batch < batches; batch += 1) {
      const started = performance.now();
      for (let run = 0; run < runs; run += 1) selectSessionCookies({ storageKey: KEY, header, current });
      fastest = Math.min(fastest, (performance.now() - started) / runs);
    }

    // The old code took about 11 ms here; a slower CI machine still stays far below 4.
    expect(fastest).toBeLessThan(4);
  });

  it("reads only the last few copies of a name a crafted header repeats", () => {
    // Tiny unchunked copies that pass the cheap checks and then fail to parse,
    // repeated up to the header limit.
    const tiny = { name: KEY, value: "base64-eyJhfQ" };
    // An expired own session, so the candidates are read at all.
    const expired = fakeSession({ userId: "u1", email: "a@example.com", refreshToken: "rt-expired", expiresAt: now - 600 });
    const cookies = [...Array.from({ length: 1_000 }, () => tiny), ...sessionCookies(KEY, expired)];
    const header = cookieHeader(cookies);
    const current = nextRequestCookies(cookies);

    // Counting parse attempts is exact on any machine, unlike a timing.
    const parse = vi.spyOn(JSON, "parse");
    try {
      selectSessionCookies({ storageKey: KEY, header, current });
      expect(parse.mock.calls.length).toBeLessThan(40);
    } finally {
      parse.mockRestore();
    }
    // The real session, sent last, is still the one read.
    expect(sessionPart(selectSessionCookies({ storageKey: KEY, header, current }))).toEqual(sessionCookies(KEY, expired));
  });
});

describe("sessionCookieSelector", () => {
  it("decides once, and again only when the store's session cookies change", () => {
    const freshChunks = sessionCookies(KEY, padded(fresh, 3000));
    const cookies = [...sessionCookies(KEY, stale), ...freshChunks, THEME];
    const selectSession = sessionCookieSelector(KEY, cookieHeader(cookies));
    const store = nextRequestCookies(cookies);

    const first = selectSession(store);
    expect(sessionPart(first)).toEqual(freshChunks);

    // Another cookie written during the request is read, but the choice stands.
    const again = selectSession([...store, { name: "other", value: "1" }]);
    expect(again.authCookieNames).toBe(first.authCookieNames);
    expect(again.cookies).toContainEqual({ name: "other", value: "1" });
    expect(sessionPart(again)).toEqual(freshChunks);

    // The session check rotated the session: the choice is made again.
    const rotated = padded(fakeSession({ userId: "u1", email: "a@example.com", refreshToken: "rt-rotated", expiresAt: now + 3_500 }), 3000);
    const afterWrite = selectSession([...sessionCookies(KEY, stale), ...sessionCookies(KEY, rotated), THEME]);
    expect(afterWrite.authCookieNames).not.toBe(first.authCookieNames);
    expect(sessionPart(afterWrite)).toEqual(sessionCookies(KEY, rotated));
  });
});

describe("sessionCookieNames", () => {
  it("lists each session cookie name in a Cookie header once, whatever its value", () => {
    expect(sessionCookieNames(`${KEY}=a; theme=dark; ${KEY}.0=b; ${KEY}=c; ${KEY}-code-verifier=v; ${KEY}.1=`, KEY)).toEqual([KEY, `${KEY}.0`, `${KEY}.1`]);
    expect(sessionCookieNames(null, KEY)).toEqual([]);
  });
});

describe("hostOnlyCookieDeletions", () => {
  it("deletes on the responding host only, with no Domain attribute", () => {
    expect(hostOnlyCookieDeletions([KEY, `${KEY}.0`], { secure: true })).toEqual([
      `${KEY}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
      `${KEY}.0=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
    ]);
    expect(hostOnlyCookieDeletions([KEY], { secure: false })).toEqual([`${KEY}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax`]);
  });
});

describe("leftoverSessionCookieDeletions", () => {
  const SHARED = { appUrl: "https://app.linkar.in", adminUrl: "https://admin.linkar.in", publicSiteUrl: "https://linkar.in" };
  const LOCAL = { appUrl: "http://localhost:3000", adminUrl: "http://localhost:3000", publicSiteUrl: "http://localhost:3000" };
  const conflict = select([...sessionCookies(KEY, stale), ...sessionCookies(KEY, padded(fresh, 3000))]);
  const single = select(sessionCookies(KEY, fresh));

  it("deletes every session cookie name on an app or admin host when the shared domain is in use and a leftover was seen", () => {
    for (const hostname of ["admin.linkar.in", "app.linkar.in", "ADMIN.linkar.in:443"]) {
      const deletions = leftoverSessionCookieDeletions({ origins: SHARED, hostname, selection: conflict });
      expect(deletions.map((cookie) => cookie.split("=")[0])).toEqual([KEY, `${KEY}.0`, `${KEY}.1`]);
      for (const cookie of deletions) expect(cookie).toContain("; Secure");
    }
  });

  it("deletes nothing without a leftover, in local development, on the shared domain itself or on another host", () => {
    expect(leftoverSessionCookieDeletions({ origins: SHARED, hostname: "admin.linkar.in", selection: single })).toEqual([]);
    expect(leftoverSessionCookieDeletions({ origins: LOCAL, hostname: "localhost:3000", selection: conflict })).toEqual([]);
    expect(leftoverSessionCookieDeletions({ origins: SHARED, hostname: "linkar.in", selection: conflict })).toEqual([]);
    expect(leftoverSessionCookieDeletions({ origins: SHARED, hostname: "evil-linkar.in", selection: conflict })).toEqual([]);
  });

  const names = (deletions: string[]) => deletions.map((cookie) => cookie.split("=")[0]);

  it("also deletes host-only copies when the response changes the session cookies the browser sent", () => {
    // auth-js refreshed or removed the session the browser sent.
    expect(names(leftoverSessionCookieDeletions({ origins: SHARED, hostname: "admin.linkar.in", selection: single, written: new Set([KEY]) }))).toEqual([KEY]);
    // A write of a cookie the browser did not send changes none of its session cookies.
    expect(leftoverSessionCookieDeletions({ origins: SHARED, hostname: "admin.linkar.in", selection: single, written: new Set(["other"]) })).toEqual([]);
    // Never in local development or from the shared domain itself.
    expect(leftoverSessionCookieDeletions({ origins: LOCAL, hostname: "localhost:3000", selection: single, written: new Set([KEY]) })).toEqual([]);
    expect(leftoverSessionCookieDeletions({ origins: SHARED, hostname: "linkar.in", selection: single, written: new Set([KEY]) })).toEqual([]);
  });

  it("deletes stray chunks at the session cookies' own scope, unless the response writes that name", () => {
    const stray = select([...sessionCookies(KEY, padded(fresh, 3000)), { name: `${KEY}.2`, value: "left-over" }]);

    const shared = leftoverSessionCookieDeletions({ origins: SHARED, hostname: "admin.linkar.in", selection: stray });
    expect(shared.filter((cookie) => /; Domain=/.test(cookie))).toEqual([`${KEY}.2=; Domain=linkar.in; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax; Secure`]);
    expect(names(shared.filter((cookie) => !/; Domain=/.test(cookie)))).toEqual([`${KEY}.0`, `${KEY}.1`, `${KEY}.2`]);
    // From the shared domain itself only the shared-scope deletion goes out.
    expect(names(leftoverSessionCookieDeletions({ origins: SHARED, hostname: "linkar.in", selection: stray }))).toEqual([`${KEY}.2`]);

    expect(leftoverSessionCookieDeletions({ origins: LOCAL, hostname: "localhost:3000", selection: stray })).toEqual([`${KEY}.2=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax`]);
    expect(leftoverSessionCookieDeletions({ origins: LOCAL, hostname: "localhost:3000", selection: stray, written: new Set([`${KEY}.2`]) })).toEqual([]);
  });
});
