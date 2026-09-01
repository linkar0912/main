"use client";

import { useEffect, useMemo, useState } from "react";
import { AtSign, Download, Search, UsersRound } from "lucide-react";
import { AppShell } from "./app-shell";
import { ContactDetailModal } from "./contact-detail-modal";
import { ContextHelpLink } from "./context-help-link";

type LeadStatus = "NEW" | "ENGAGED" | "QUALIFIED" | "CUSTOMER";
type ContactRow = {
  id: string;
  instagramAccountId: string;
  igScopedUserId: string;
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
  return contact.email ?? `IG user ·${contact.igScopedUserId.slice(-6)}`;
}

function formatSeen(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ContactsScreen() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [counts, setCounts] = useState<Record<LeadStatus, number>>({ NEW: 0, ENGAGED: 0, QUALIFIED: 0, CUSTOMER: 0 });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [openContactId, setOpenContactId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/contacts?scope=all&limit=200")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as {
          data?: { contacts: ContactRow[]; counts: Record<LeadStatus, number> };
          error?: string;
        };
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load contacts");
        if (cancelled) return;
        setContacts(payload.data.contacts);
        setCounts(payload.data.counts);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load contacts");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (status && contact.leadStatus !== status) return false;
      if (!needle) return true;
      return [contactName(contact), contact.igScopedUserId, contact.assigneeUserId ?? "", ...contact.tags]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [contacts, query, status]);

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return (
    <AppShell>
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
              placeholder="Search email, Instagram ID, tag, or assignee"
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
          <div className="empty-state"><div className="loading-line" /><div className="loading-line short" /></div>
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
                    <span className="contact-avatar" aria-hidden>{contact.email ? <AtSign size={17} /> : <UsersRound size={17} />}</span>
                    <span><strong>{contactName(contact)}</strong><small>{contact.tags.join(" · ") || contact.state.toLowerCase()}</small></span>
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
    </AppShell>
  );
}
