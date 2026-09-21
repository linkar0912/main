"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Search, UsersRound } from "lucide-react";
import { ContactDetailModal } from "./contact-detail-modal";
import { ContextHelpLink } from "./context-help-link";
import { ContactsContentSkeleton } from "./skeleton";
import { SocialAvatar } from "./social-avatar";

type LeadStatus = "NEW" | "ENGAGED" | "QUALIFIED" | "CUSTOMER";
type ContactRow = {
  id: string;
  instagramAccountId: string;
  igScopedUserId: string;
  instagramUsername?: string;
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

function contactName(contact: ContactRow): string {
  const username = contact.instagramUsername?.trim().replace(/^@+/, "");
  return username ? `@${username}` : contact.email ?? "Instagram user";
}

function formatSeen(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

type ContactsSnapshot = {
  contacts: ContactRow[];
  counts: Record<LeadStatus, number>;
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

function readContactsCache(): ContactsSnapshot | undefined {
  const snapshot = contactsCache.snapshot;
  if (!snapshot || snapshot.fetcher !== fetch) return undefined;
  return snapshot;
}

type ContactsListPayload = { count?: number; counts?: Record<LeadStatus, number>; contacts?: ContactRow[] };

async function fetchContactsList(signal?: AbortSignal): Promise<ContactsSnapshot> {
  const response = await fetch("/api/contacts?scope=all&limit=200", { signal });
  const payload = await response.json().catch(() => ({})) as { data?: ContactsListPayload; error?: string };
  if (!response.ok || !Array.isArray(payload.data?.contacts)) {
    throw new Error(payload.error ?? "Could not load contacts");
  }
  const snapshot: ContactsSnapshot = {
    contacts: payload.data.contacts,
    counts: payload.data.counts ?? { NEW: 0, ENGAGED: 0, QUALIFIED: 0, CUSTOMER: 0 },
    fetchedAt: Date.now(),
    fetcher: fetch,
  };
  contactsCache.snapshot = snapshot;
  return snapshot;
}

export function ContactsScreen() {
  const [contacts, setContacts] = useState<ContactRow[]>(() => readContactsCache()?.contacts ?? []);
  const [counts, setCounts] = useState<Record<LeadStatus, number>>(() => readContactsCache()?.counts ?? { NEW: 0, ENGAGED: 0, QUALIFIED: 0, CUSTOMER: 0 });
  const [loaded, setLoaded] = useState(() => readContactsCache() !== undefined);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [openContactId, setOpenContactId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = readContactsCache();
    if (cached && Date.now() - cached.fetchedAt < CONTACTS_FRESH_FOR_MS) {
      // Fresh cache: nothing to fetch at all this visit.
      return () => { cancelled = true; };
    }

    // Reconciliation and the list fetch run in parallel now - the POST no
    // longer gates first paint. If it did create contacts, one follow-up GET
    // picks them up (the common case reconciles 0 and skips the refetch).
    const reconcile: Promise<{ data?: { reconciled?: number } }> = fetch("/api/contacts", { method: "POST" })
      .then(async (response) => (await response.json().catch(() => ({}))) as { data?: { reconciled?: number } })
      .catch(() => ({}));

    const apply = (snapshot: ContactsSnapshot) => {
      if (cancelled) return;
      setContacts(snapshot.contacts);
      setCounts(snapshot.counts);
      setError("");
      setLoaded(true);
    };

    void (async () => {
      try {
        apply(await fetchContactsList());
      } catch (caught: unknown) {
        if (!cancelled) {
          // Keep cached rows on screen if we have them; only surface the error
          // when there is nothing to show.
          if (!cached) setError(caught instanceof Error ? caught.message : "Could not load contacts");
          setLoaded(true);
        }
      }
      const result = await reconcile;
      if (cancelled || !result.data?.reconciled) return;
      try {
        apply(await fetchContactsList());
      } catch {
        // The rows just painted are still valid; the next visit picks up the
        // reconciled contacts.
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (status && contact.leadStatus !== status) return false;
      if (!needle) return true;
      return [contactName(contact), contact.email ?? "", contact.assigneeUserId ?? "", ...contact.tags]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [contacts, query, status]);

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return (
    <>
      <div className="page-wrap contacts-wrap">
        <header className="page-header">
          <div>
            <p className="eyebrow">Workspace / audience</p>
            <h1>Contacts</h1>
            <p className="muted page-lede">Every Instagram contact, lead stage, note, assignment, and conversation timeline in one place.</p>
          </div>
          <div className="header-actions">
            <ContextHelpLink topic="leads" />
            <a className="button button-secondary" href="/api/contacts/export" download><Download size={16} /> Export CSV</a>
          </div>
        </header>

        <section className="contacts-toolbar panel" aria-label="Filter contacts">
          <label className="contacts-search">
            <Search size={18} aria-hidden />
            <input
              type="search"
              aria-label="Search contacts"
              placeholder="Search Instagram handle, email, tag, or assignee"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="filter-chips" role="group" aria-label="Filter contacts by lead stage">
            <button type="button" className={`filter-chip ${status === "" ? "is-on" : ""}`} onClick={() => setStatus("")}>All {total}</button>
            {STATUS_ORDER.map((value) => (
              <button key={value} type="button" className={`filter-chip ${status === value ? "is-on" : ""}`} onClick={() => setStatus(value)}>
                {STATUS_LABELS[value]} {counts[value]}
              </button>
            ))}
          </div>
        </section>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {!loaded ? (
          <ContactsContentSkeleton withToolbar={false} />
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><UsersRound size={20} /></span>
            <h2>{contacts.length === 0 ? "No contacts yet" : "No matching contacts"}</h2>
            <p>{contacts.length === 0 ? "Contacts appear after someone interacts with an Instagram automation." : "Try another search or lead-stage filter."}</p>
          </div>
        ) : (
          <section className="panel contacts-panel" aria-label="Customer contacts">
            <div className="contacts-table-head" aria-hidden>
              <span>Contact</span><span>Stage</span><span>Engagement</span><span>Owner</span><span>Last seen</span><span />
            </div>
            <ul className="contacts-list">
              {visible.map((contact) => (
                <li key={contact.id} className="contact-row">
                  <div className="contact-primary">
                    <SocialAvatar channel="instagram" name={contactName(contact)} src={`/api/contacts/${contact.id}/avatar`} />
                    <span><strong>{contactName(contact)}</strong><small>{[contact.email, ...contact.tags].filter(Boolean).join(" · ") || contact.state.toLowerCase()}</small></span>
                  </div>
                  <span className={`status-pill is-${contact.leadStatus.toLowerCase()}`}>{STATUS_LABELS[contact.leadStatus]}</span>
                  <span className="contact-score">{contact.score} pts{contact.suppressedAt ? " · opted out" : ""}</span>
                  <span className="contact-owner">{contact.assigneeUserId ?? "Unassigned"}</span>
                  <time dateTime={contact.lastSeenAt}>{formatSeen(contact.lastSeenAt)}</time>
                  <button className="button button-ghost button-small" type="button" aria-label={`Open ${contactName(contact)}`} onClick={() => setOpenContactId(contact.id)}>Open</button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {openContactId ? <ContactDetailModal contactId={openContactId} onClose={() => setOpenContactId(null)} /> : null}
      </div>
    </>
  );
}
