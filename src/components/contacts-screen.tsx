"use client";

import { Presence } from "@/src/components/ui/use-presence";
import { slidingThumbRef } from "@/src/components/ui/use-sliding-thumb";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Download, Search, UsersRound } from "lucide-react";
import { ContactDetailModal, type ContactUpdate } from "./contact-detail-modal";
import { ContextHelpLink } from "./context-help-link";
import { ContactsContentSkeleton } from "./skeleton";
import { SocialAvatar } from "./social-avatar";
import { PageHeader } from "./page-header";
import { useTeamMembers } from "@/src/lib/client/team-members";
import { LocalRelativeTime } from "./workspace-primitives";

type LeadStatus = "NEW" | "ENGAGED" | "QUALIFIED" | "CUSTOMER";
type ContactRow = {
  id: string;
  instagramAccountId: string;
  igScopedUserId: string;
  instagramUsername?: string;
  avatarUrl?: string;
  email?: string;
  state: string;
  tags: string[];
  score: number;
  leadStatus: LeadStatus;
  assigneeUserId?: string;
  suppressedAt?: string;
  lastSeenAt: string;
  createdAt: string;
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  ENGAGED: "Engaged",
  QUALIFIED: "Qualified",
  CUSTOMER: "Customer",
};
const STATUS_ORDER: LeadStatus[] = ["NEW", "ENGAGED", "QUALIFIED", "CUSTOMER"];
const EMPTY_COUNTS: Record<LeadStatus, number> = { NEW: 0, ENGAGED: 0, QUALIFIED: 0, CUSTOMER: 0 };

// `state` tracks the DM email/field-capture conversation, not whether the
// person has interacted - so "NONE" must not read as "No activity yet".
const CAPTURE_STATE_LABELS: Record<string, string> = {
  AWAITING_EMAIL: "Waiting for their email",
  AWAITING_FIELD: "Answering questions",
  CAPTURED: "Details captured",
};

function contactName(contact: ContactRow): string {
  const username = contact.instagramUsername?.trim().replace(/^@+/, "");
  return username ? `@${username}` : contact.email ?? "Instagram user";
}

/** Tags the engine sets itself, in words; people's own tags show as typed. */
const AUTOMATIC_TAG_LABELS: Record<string, string> = {
  email_captured: "email captured",
  opted_out: "opted out",
  clicked: "clicked a link",
};

function contactSubtitle(contact: ContactRow): string {
  const tags = contact.tags.map((tag) => AUTOMATIC_TAG_LABELS[tag] ?? tag);
  const details = [contact.email, ...tags].filter(Boolean).join(", ");
  if (details) return details;
  return CAPTURE_STATE_LABELS[contact.state] ?? "Instagram contact";
}

type ContactsSnapshot = {
  contacts: ContactRow[];
  counts: Record<LeadStatus, number>;
  needsProfileEnrichment?: boolean;
  hasMore?: boolean;
  /** Rows fetched by unfiltered pages - the next "All" offset. */
  allOffset?: number;
  fetchedAt: number;
  // Fetcher identity ties the cache to the current session/test stub; a
  // swapped global fetch (new login, new test) implicitly invalidates it.
  fetcher?: typeof fetch;
};

// Stale-while-revalidate, mirroring src/lib/client/workspace-data.ts: revisits
// paint cached rows instantly and refresh in the background instead of
// re-showing the skeleton on every navigation.
const CONTACTS_FRESH_FOR_MS = 120_000;
const contactsCache: { snapshot?: ContactsSnapshot } = {};
const RECONCILE_FRESH_FOR_MS = 15 * 60_000;
/** sessionStorage key for the last backfill attempt, so a reload does not repeat it. */
export const CONTACTS_RECONCILED_AT_KEY = "linkar.contacts.reconciledAt";
let lastReconciledAt = 0;
let reconciliationPending = false;
let reconciliationFetcher: typeof fetch | undefined;

/** The latest backfill attempt in this tab, in memory or from an earlier page load. */
function lastReconcileAttempt(): number {
  let stored = 0;
  try {
    stored = Number(window.sessionStorage.getItem(CONTACTS_RECONCILED_AT_KEY)) || 0;
  } catch {
    // Storage can be blocked; the in-memory time still applies.
  }
  return Math.max(lastReconciledAt, stored);
}

function recordReconcileAttempt(at: number) {
  lastReconciledAt = at;
  try {
    window.sessionStorage.setItem(CONTACTS_RECONCILED_AT_KEY, String(at));
  } catch {
    // Storage can be blocked or full; the in-memory time still applies.
  }
}

function readContactsCache(): ContactsSnapshot | undefined {
  const snapshot = contactsCache.snapshot;
  if (!snapshot || snapshot.fetcher !== fetch) return undefined;
  return snapshot;
}

type ContactsListPayload = {
  count?: number;
  counts?: Record<LeadStatus, number>;
  contacts?: ContactRow[];
  needsProfileEnrichment?: boolean;
  hasMore?: boolean;
  nextCursor?: string;
  /** Present when the list answers a search (`q`). */
  query?: string;
};

const PAGE_SIZE = 200;
/** Wait this long after the last keystroke before searching the server. */
export const CONTACT_SEARCH_DEBOUNCE_MS = 250;

async function fetchContactsList(
  enrich = false,
  signal?: AbortSignal,
  page: { leadStatus?: LeadStatus; offset?: number; q?: string; cursor?: string } = {},
): Promise<ContactsSnapshot & { nextCursor?: string }> {
  let url = `/api/contacts?scope=all&limit=${PAGE_SIZE}`;
  if (page.q) url += `&q=${encodeURIComponent(page.q)}`;
  if (page.leadStatus) url += `&leadStatus=${page.leadStatus}`;
  if (page.cursor) url += `&cursor=${encodeURIComponent(page.cursor)}`;
  else if (page.offset) url += `&offset=${page.offset}`;
  if (enrich) url += "&enrich=1";
  const response = await fetch(url, { signal });
  const payload = await response.json().catch(() => ({})) as { data?: ContactsListPayload; error?: string };
  if (!response.ok || !Array.isArray(payload.data?.contacts)) {
    throw new Error(payload.error ?? "Could not load contacts");
  }
  return {
    contacts: payload.data.contacts,
    counts: payload.data.counts ?? EMPTY_COUNTS,
    needsProfileEnrichment: payload.data.needsProfileEnrichment,
    hasMore: payload.data.hasMore,
    nextCursor: payload.data.nextCursor,
    fetchedAt: Date.now(),
    fetcher: fetch,
  };
}

/**
 * One server search: the rows the API matched across the whole workspace
 * (not just the rows loaded here), for `query` and stage `status`.
 */
type SearchResult = {
  query: string;
  status: LeadStatus | "";
  rows: ContactRow[];
  counts: Record<LeadStatus, number>;
  nextCursor?: string;
  error: string;
};

/** Every word of `query` in the contact's name, email, owner or tags - the instant, on-screen guess. */
function matchesLocally(contact: ContactRow, needle: string, owner: string): boolean {
  return [contactName(contact), contact.email ?? "", owner, ...contact.tags].join(" ").toLowerCase().includes(needle);
}

/** Newest activity first - the order every server page uses. */
function compareRows(a: ContactRow, b: ContactRow): number {
  return b.lastSeenAt.localeCompare(a.lastSeenAt) || a.id.localeCompare(b.id);
}

/**
 * Where the next server page for `stage` starts. Rows fetched for a stage are
 * a prefix of that stage's server order, so their count is the offset - except
 * for rows moved into the stage here in the drawer. The server now lists those
 * in the new stage at their own position, which may lie past what has been
 * fetched; counting them anyway would skip a row on the next page. They only
 * count when they sort inside the fetched prefix. `movedFrom` maps a moved
 * contact to the stage the server last listed it under.
 */
export function stagePageOffset(rows: ContactRow[], stage: LeadStatus, movedFrom: ReadonlyMap<string, LeadStatus>): number {
  const movedIn = (row: ContactRow) => movedFrom.has(row.id) && movedFrom.get(row.id) !== row.leadStatus;
  let boundary: ContactRow | undefined;
  for (const row of rows) {
    if (row.leadStatus !== stage || movedIn(row)) continue;
    if (!boundary || compareRows(row, boundary) > 0) boundary = row;
  }
  return rows.filter((row) => row.leadStatus === stage && (!movedIn(row) || (boundary !== undefined && compareRows(row, boundary) <= 0))).length;
}

/** Union by id, newest activity first - the order every server page uses. */
function mergeRows(current: ContactRow[], incoming: ContactRow[]): ContactRow[] {
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) {
    const existing = byId.get(row.id);
    byId.set(row.id, {
      ...row,
      instagramUsername: row.instagramUsername ?? existing?.instagramUsername,
      avatarUrl: row.avatarUrl ?? existing?.avatarUrl,
    });
  }
  return [...byId.values()].sort(compareRows);
}

export function ContactsScreen() {
  const [contacts, setContacts] = useState<ContactRow[]>(() => readContactsCache()?.contacts ?? []);
  const [counts, setCounts] = useState<Record<LeadStatus, number>>(() => readContactsCache()?.counts ?? EMPTY_COUNTS);
  const [allOffset, setAllOffset] = useState(() => readContactsCache()?.allOffset ?? readContactsCache()?.contacts.length ?? 0);
  const [loaded, setLoaded] = useState(() => readContactsCache() !== undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // /contacts?q=text starts searched; /contacts?contact=<id> (a contact
  // picked in the ⌘K palette) opens that person's drawer. Both follow the
  // URL while the page is open, so a second pick from the palette works too.
  const urlQuery = searchParams.get("q")?.trim() ?? "";
  const urlContact = searchParams.get("contact")?.trim() ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [openContactId, setOpenContactId] = useState<string | null>(urlContact || null);
  const [seenUrl, setSeenUrl] = useState({ q: urlQuery, contact: urlContact });
  if (seenUrl.q !== urlQuery || seenUrl.contact !== urlContact) {
    // Adjusting state to a new URL while rendering (no effect round trip).
    setSeenUrl({ q: urlQuery, contact: urlContact });
    if (seenUrl.q !== urlQuery) setQuery(urlQuery);
    if (seenUrl.contact !== urlContact && urlContact) setOpenContactId(urlContact);
  }
  // Bumped by "Try again" after a failed first load to rerun the loader.
  const [loadAttempt, setLoadAttempt] = useState(0);
  const members = useTeamMembers();

  // Server search: the box (and ?q=) searches every contact in the
  // workspace, not only the rows loaded here. Typing filters the loaded rows
  // at once; the server's answer replaces them a moment later.
  const trimmedQuery = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState(trimmedQuery);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [searchingMore, setSearchingMore] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(trimmedQuery), trimmedQuery ? CONTACT_SEARCH_DEBOUNCE_MS : 0);
    return () => window.clearTimeout(timer);
  }, [trimmedQuery]);
  useEffect(() => {
    if (!debouncedQuery) return;
    const controller = new AbortController();
    const request = { q: debouncedQuery, ...(status ? { leadStatus: status } : {}) };
    fetchContactsList(false, controller.signal, request).then(
      (page) => {
        if (controller.signal.aborted) return;
        setSearch({ query: debouncedQuery, status, rows: page.contacts, counts: page.counts, nextCursor: page.nextCursor, error: "" });
        if (!page.needsProfileEnrichment) return;
        void fetchContactsList(true, controller.signal, request)
          .then((enriched) => {
            if (controller.signal.aborted) return;
            setSearch((current) => current && current.query === debouncedQuery && current.status === status
              ? { ...current, rows: mergeRows(current.rows, enriched.contacts.filter((row) => current.rows.some((shown) => shown.id === row.id))) }
              : current);
          })
          .catch(() => undefined);
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        setSearch({ query: debouncedQuery, status, rows: [], counts: EMPTY_COUNTS, error: caught instanceof Error ? caught.message : "Could not search contacts" });
      },
    );
    return () => controller.abort();
  }, [debouncedQuery, status]);
  const autoLoadedStatus = useRef(new Set<LeadStatus>());
  // Contacts whose stage changed in the drawer -> the stage the server last
  // listed them under. Keeps stage pagination offsets honest (stagePageOffset).
  const movedFrom = useRef(new Map<string, LeadStatus>());

  // Every contacts update goes through here so the module cache stays in step.
  const commit = useCallback((rows: ContactRow[], patch: Partial<ContactsSnapshot> = {}) => {
    setContacts(rows);
    const previous = contactsCache.snapshot;
    contactsCache.snapshot = {
      counts: previous?.counts ?? EMPTY_COUNTS,
      fetchedAt: previous?.fetchedAt ?? Date.now(),
      fetcher: fetch,
      ...previous,
      ...patch,
      contacts: rows,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (reconciliationFetcher !== fetch) {
      reconciliationFetcher = fetch;
      lastReconciledAt = 0;
      reconciliationPending = false;
    }
    const cached = readContactsCache();
    if (cached && Date.now() - cached.fetchedAt < CONTACTS_FRESH_FOR_MS) {
      // Fresh cache: nothing to fetch at all this visit.
      return () => { cancelled = true; };
    }

    const apply = (snapshot: ContactsSnapshot) => {
      if (cancelled) return;
      const rows = mergeRows(cached?.contacts.filter((row) => snapshot.contacts.some((next) => next.id === row.id)) ?? [], snapshot.contacts);
      movedFrom.current.clear();
      contactsCache.snapshot = { ...snapshot, contacts: rows, allOffset: snapshot.contacts.length };
      setContacts(rows);
      setCounts(snapshot.counts);
      setAllOffset(snapshot.contacts.length);
      setError("");
      setLoaded(true);
    };
    const applyEnrichment = (snapshot: ContactsSnapshot) => {
      if (cancelled) return;
      setContacts((current) => {
        const names = new Map(snapshot.contacts.map((row) => [row.id, row]));
        const rows = current.map((row) => ({
          ...row,
          instagramUsername: names.get(row.id)?.instagramUsername ?? row.instagramUsername,
          avatarUrl: names.get(row.id)?.avatarUrl ?? row.avatarUrl,
        }));
        if (contactsCache.snapshot) contactsCache.snapshot = { ...contactsCache.snapshot, contacts: rows };
        return rows;
      });
    };

    void (async () => {
      try {
        const first = await fetchContactsList();
        apply(first);
        if (first.needsProfileEnrichment) {
          // Name lookups can take seconds when Meta is slow. Keep the list
          // interactive and merge them in when the background pass finishes.
          void fetchContactsList(true).then(applyEnrichment).catch(() => undefined);
        }
      } catch (caught: unknown) {
        if (!cancelled) {
          // Keep cached rows on screen if we have them; only surface the error
          // when there is nothing to show.
          if (!cached) setError(caught instanceof Error ? caught.message : "Could not load contacts");
          setLoaded(true);
        }
        // The server is struggling; a backfill now would only add load.
        return;
      }
      // Backfill older participants only occasionally and after the visible
      // list has loaded. This operation can touch hundreds of contacts, so
      // running it beside every list request made the first paint slower.
      if (cancelled || reconciliationPending || Date.now() - lastReconcileAttempt() < RECONCILE_FRESH_FOR_MS) return;
      reconciliationPending = true;
      // Every attempt counts, failed ones too, and it survives a reload: a
      // backfill that timed out must not be resent on the very next visit.
      recordReconcileAttempt(Date.now());
      let reconciled = 0;
      try {
        const response = await fetch("/api/contacts", { method: "POST" });
        if (response.ok) {
          const result = (await response.json().catch(() => ({}))) as { data?: { reconciled?: number } };
          reconciled = result.data?.reconciled ?? 0;
        }
      } catch {
        // The confirmed list remains usable if background backfill fails.
      } finally {
        reconciliationPending = false;
      }
      if (!reconciled) return;
      if (cancelled) {
        contactsCache.snapshot = undefined;
        return;
      }
      try {
        apply(await fetchContactsList());
      } catch {
        // The rows just painted are still valid; the next visit picks up the
        // reconciled contacts.
      }
    })();

    return () => { cancelled = true; };
  }, [loadAttempt]);

  const searchActive = Boolean(trimmedQuery);
  // The server's answer for exactly what is asked now (text and stage).
  const searchFresh = searchActive && search && search.query === trimmedQuery && search.status === status ? search : null;
  const searchPending = searchActive && !searchFresh;
  // Stage counts follow the search once the server has answered for the text.
  const shownCounts = searchActive && search && search.query === trimmedQuery && !search.error ? search.counts : counts;
  const total = Object.values(shownCounts).reduce((sum, value) => sum + value, 0);
  const loadedForStatus = searchFresh
    ? searchFresh.rows.length
    : status ? contacts.filter((contact) => contact.leadStatus === status).length : allOffset;
  const availableForStatus = status ? shownCounts[status] : total;
  const hasMore = searchActive
    ? Boolean(searchFresh?.nextCursor)
    : loaded && loadedForStatus < availableForStatus;

  // The next server page of the current search (keyset cursor).
  async function loadMoreSearch() {
    const current = searchFresh;
    if (!current?.nextCursor || searchingMore) return;
    setSearchingMore(true);
    try {
      const page = await fetchContactsList(false, undefined, {
        q: current.query,
        cursor: current.nextCursor,
        ...(current.status ? { leadStatus: current.status } : {}),
      });
      setSearch((latest) => latest && latest.query === current.query && latest.status === current.status
        ? { ...latest, rows: mergeRows(latest.rows, page.contacts), counts: page.counts, nextCursor: page.nextCursor }
        : latest);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load more contacts");
    } finally {
      setSearchingMore(false);
    }
  }

  const loadMore = useCallback(async (target: LeadStatus | "" = status) => {
    if (loadingMore) return;
    setLoadingMore(true);
    // Stage pages continue after the stage rows already fetched; those are
    // always a prefix of that stage's newest-first order.
    const stageOffset = target ? stagePageOffset(contacts, target, movedFrom.current) : 0;
    const request = target ? { leadStatus: target, offset: stageOffset } : { offset: allOffset };
    try {
      const page = await fetchContactsList(false, undefined, request);
      // Rows the server just returned are back in step with its order.
      for (const row of page.contacts) movedFrom.current.delete(row.id);
      const nextAllOffset = target ? allOffset : allOffset + page.contacts.length;
      commit(mergeRows(contacts, page.contacts), { counts: page.counts, allOffset: nextAllOffset });
      setCounts(page.counts);
      setAllOffset(nextAllOffset);
      setError("");
      if (page.needsProfileEnrichment) {
        void fetchContactsList(true, undefined, request)
          .then((enriched) => setContacts((current) => {
            const rows = mergeRows(current, enriched.contacts);
            if (contactsCache.snapshot) contactsCache.snapshot = { ...contactsCache.snapshot, contacts: rows };
            return rows;
          }))
          .catch(() => undefined);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load more contacts");
    } finally {
      setLoadingMore(false);
    }
  }, [allOffset, commit, contacts, loadingMore, status]);

  // Picking a stage whose contacts are not on screen yet (the first page is
  // the newest 200 overall) fetches that stage directly, once per stage.
  function selectStatus(next: LeadStatus | "") {
    setStatus(next);
    if (!next || !loaded || autoLoadedStatus.current.has(next)) return;
    const onScreen = contacts.filter((contact) => contact.leadStatus === next).length;
    if (onScreen >= Math.min(counts[next], PAGE_SIZE)) return;
    autoLoadedStatus.current.add(next);
    void loadMore(next);
  }

  const visible = useMemo(() => {
    if (searchFresh) return searchFresh.rows.filter((contact) => !status || contact.leadStatus === status);
    // No server answer yet: filter what is loaded, so typing responds at once.
    const needle = trimmedQuery.toLowerCase();
    return contacts.filter((contact) => {
      if (status && contact.leadStatus !== status) return false;
      if (!needle) return true;
      const owner = contact.assigneeUserId ? members.get(contact.assigneeUserId) ?? contact.assigneeUserId : "";
      return matchesLocally(contact, needle, owner);
    });
  }, [contacts, members, searchFresh, status, trimmedQuery]);

  function retryFirstLoad() {
    setError("");
    setLoaded(false);
    setLoadAttempt((attempt) => attempt + 1);
  }

  const firstLoadFailed = Boolean(error) && contacts.length === 0;
  const filtering = Boolean(trimmedQuery) || status !== "";

  // Closing the drawer also drops ?contact= so a reload does not reopen it.
  function setOpenContact(next: string | null) {
    setOpenContactId(next);
    if (next || !searchParams.has("contact")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("contact");
    const rest = params.toString();
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false });
  }
  const toggleContact = (id: string) => setOpenContact(openContactId === id ? null : id);

  function applyContactUpdate(id: string, update: ContactUpdate) {
    setSearch((current) => current && { ...current, rows: current.rows.map((contact) => (contact.id === id ? { ...contact, ...update } : contact)) });
    const previous = contacts.find((contact) => contact.id === id);
    const rows = contacts.map((contact) => (contact.id === id ? { ...contact, ...update } : contact));
    let nextCounts = counts;
    if (previous && update.leadStatus && update.leadStatus !== previous.leadStatus) {
      if (!movedFrom.current.has(id)) movedFrom.current.set(id, previous.leadStatus);
      nextCounts = { ...counts, [previous.leadStatus]: Math.max(0, counts[previous.leadStatus] - 1), [update.leadStatus]: counts[update.leadStatus] + 1 };
      setCounts(nextCounts);
    }
    commit(rows, { counts: nextCounts });
  }

  return (
    <>
      <div className={`page-wrap contacts-wrap ws-page${openContactId ? " has-drawer" : ""}`}>
        <PageHeader
          title="Contacts"
          description="Everyone who has talked to your automations, with their stage, owner and notes."
          help={<ContextHelpLink topic="leads" />}
          actions={<a className="button button-secondary" href="/api/contacts/export" download><Download size={16} aria-hidden /> Export CSV</a>}
        />

        {/* Stages are the page's views: underline tabs above the list. */}
        {firstLoadFailed ? null : (
          <div ref={slidingThumbRef} className="tab-underline contacts-stage-tabs" role="group" aria-label="Filter contacts by lead stage">
            <button type="button" className={status === "" ? "is-active" : undefined} aria-pressed={status === ""} onClick={() => selectStatus("")}>All <span className="tab-count">{total}</span></button>
            {STATUS_ORDER.map((value) => (
              <button key={value} type="button" className={status === value ? "is-active" : undefined} aria-pressed={status === value} onClick={() => selectStatus(value)}>
                {STATUS_LABELS[value]} <span className="tab-count">{shownCounts[value]}</span>
              </button>
            ))}
          </div>
        )}

        <div className="surface is-flush contacts-surface">
        {firstLoadFailed ? null : <section className="contacts-toolbar" aria-label="Filter contacts">
          <label className="contacts-search">
            <Search size={18} aria-hidden />
            <input
              type="search"
              aria-label="Search contacts"
              placeholder="Search Instagram handle, email, tag, or owner"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </section>}

        {error && !firstLoadFailed ? <p className="form-error contacts-error" role="alert">{error}</p> : null}
        {searchFresh?.error ? <p className="form-error contacts-error" role="alert">{searchFresh.error}</p> : null}
        {/* Announces the server's answer to screen readers as it lands. */}
        <p className="sr-only" role="status">
          {searchFresh && !searchFresh.error ? `${availableForStatus.toLocaleString()} ${availableForStatus === 1 ? "contact matches" : "contacts match"}` : ""}
        </p>
        {!loaded && !searchFresh ? (
          <ContactsContentSkeleton withToolbar={false} />
        ) : firstLoadFailed ? (
          <div className="empty-state is-inline contacts-load-error" role="alert">
            <span className="empty-icon"><AlertCircle size={20} /></span>
            <h2>Contacts didn’t load</h2>
            <p>{error}</p>
            <button className="button button-secondary button-small" type="button" onClick={retryFirstLoad}>Try again</button>
          </div>
        ) : visible.length === 0 && searchPending ? (
          <div className="empty-state is-inline contacts-searching" role="status">
            <span className="empty-icon"><Search size={20} /></span>
            <h2>Searching all contacts…</h2>
            <p>Looking for “{trimmedQuery}” in handles, emails, tags and owners.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state is-inline">
            <span className="empty-icon"><UsersRound size={20} /></span>
            <h2>{contacts.length === 0 && !searchActive ? "No contacts yet" : loadingMore ? "Loading contacts…" : "No matching contacts"}</h2>
            <p>{contacts.length === 0 && !searchActive ? "Contacts appear after someone interacts with an Instagram automation." : "Try another search or lead-stage filter."}</p>
            {(contacts.length > 0 || searchActive) && filtering && !loadingMore ? (
              <button className="button button-secondary button-small" type="button" onClick={() => { setQuery(""); setStatus(""); }}>Clear search and filters</button>
            ) : null}
          </div>
        ) : (
          <section className="contacts-panel" aria-label="Customer contacts">
            <div className="contacts-table-head" aria-hidden>
              <span>Contact</span><span>Stage</span><span>Owner</span><span>Last seen</span><span />
            </div>
            <ul className="contacts-list">
              {visible.map((contact) => (
                <li
                  key={contact.id}
                  className={`contact-row select-rail${openContactId === contact.id ? " is-selected" : ""}`}
                  onClick={(event) => {
                    // The whole row toggles the panel; the button below stays the
                    // keyboard-accessible control.
                    if ((event.target as HTMLElement).closest("button, a")) return;
                    toggleContact(contact.id);
                  }}
                >
                  <div className="contact-primary">
                    <SocialAvatar channel="instagram" name={contactName(contact)} src={contact.avatarUrl} />
                    <span className="contact-primary-copy"><strong title={contactName(contact)}>{contactName(contact)}</strong><small title={contactSubtitle(contact)}>{contactSubtitle(contact)}</small></span>
                  </div>
                  <span className="contact-stage">
                    <span className={`status-pill is-${contact.leadStatus.toLowerCase()}`}>{STATUS_LABELS[contact.leadStatus]}</span>
                    <span className="contact-score" title="Engagement score: rises with clicks, captured details and stage changes">{contact.score} pts{contact.suppressedAt ? ", opted out" : ""}</span>
                  </span>
                  <span className="contact-owner" title={contact.assigneeUserId ? members.get(contact.assigneeUserId) : undefined}>{contact.assigneeUserId ? members.get(contact.assigneeUserId) ?? "Former member" : "Unassigned"}</span>
                  <LocalRelativeTime className="contact-last-seen" value={contact.lastSeenAt} />
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    aria-label={`${openContactId === contact.id ? "Close" : "Open"} ${contactName(contact)}`}
                    aria-expanded={openContactId === contact.id}
                    onClick={() => toggleContact(contact.id)}
                  >
                    {openContactId === contact.id ? "Close" : "Open"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {hasMore && (contacts.length > 0 || searchFresh) ? (
          <button
            className="list-toggle contacts-load-more"
            type="button"
            onClick={() => void (searchActive ? loadMoreSearch() : loadMore())}
            disabled={searchActive ? searchingMore : loadingMore}
          >
            {(searchActive ? searchingMore : loadingMore) ? "Loading…" : `Load more (showing ${loadedForStatus.toLocaleString()} of ${availableForStatus.toLocaleString()})`}
          </button>
        ) : null}
        </div>
        <Presence>{openContactId ? (
          <ContactDetailModal
            key={openContactId}
            contactId={openContactId}
            initial={contacts.find((contact) => contact.id === openContactId) ?? search?.rows.find((contact) => contact.id === openContactId)}
            onClose={() => setOpenContact(null)}
            onUpdated={(update) => applyContactUpdate(openContactId, update)}
          />
        ) : null}</Presence>
      </div>
    </>
  );
}
