"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Inbox, Info, Send } from "lucide-react";
import { ContactDetailModal } from "../contact-detail-modal";
import { ActivityContentSkeleton } from "../skeleton";
import { SocialAvatar } from "../social-avatar";
import { ConversationHeaderActions, type InboxOperation } from "./conversation-header-actions";
import { InboxFilters } from "./inbox-filters";
import type { InboxContact, InboxFiltersValue, InboxMember, InboxMessage } from "./types";

const DEFAULT_FILTERS: InboxFiltersValue = {
  query: "",
  status: "all",
  unread: false,
  assignment: "all",
  favorite: false,
  label: "",
  reminder: "all",
  sort: "newest",
};

function displayName(contact: InboxContact): string {
  return contact.username ? `@${contact.username.replace(/^@+/, "")}` : `Instagram contact ·${contact.id.slice(-5)}`;
}

function formatListTime(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMessageTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function inboxUrl(filters: InboxFiltersValue, cursor?: string): string {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (filters.query.trim()) params.set("query", filters.query.trim());
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.unread) params.set("unread", "true");
  if (filters.assignment !== "all") params.set("assignment", filters.assignment);
  if (filters.favorite) params.set("favorite", "true");
  if (filters.label) params.set("label", filters.label);
  if (filters.reminder !== "all") params.set("reminder", filters.reminder);
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  const query = params.toString();
  return query ? `/api/inbox?${query}` : "/api/inbox";
}

function mergeContacts(current: InboxContact[], incoming: InboxContact[]): InboxContact[] {
  const seen = new Set(current.map((contact) => contact.id));
  return [...current, ...incoming.filter((contact) => !seen.has(contact.id))];
}

function mergeMessages(older: InboxMessage[], current: InboxMessage[]): InboxMessage[] {
  const seen = new Set(older.map((message) => message.id));
  return [...older, ...current.filter((message) => !seen.has(message.id))];
}

function optimisticContact(contact: InboxContact, operation: InboxOperation): InboxContact {
  if (operation.action === "set_status") return { ...contact, inboxStatus: operation.status };
  if (operation.action === "set_favorite") return { ...contact, favorite: operation.favorite };
  if (operation.action === "set_reminder") return { ...contact, reminderAt: operation.reminderAt ?? undefined };
  return { ...contact, assigneeUserId: operation.assigneeUserId ?? undefined };
}

type InboxPayload = { data?: { contacts: InboxContact[]; members?: InboxMember[]; nextCursor?: string }; error?: string };
type ConversationPayload = { data?: { messages: InboxMessage[]; nextCursor?: string }; error?: string };

/** A contact-first, text-only Instagram conversation desk. */
export function InstagramInbox() {
  const [contacts, setContacts] = useState<InboxContact[]>([]);
  const [members, setMembers] = useState<InboxMember[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<string>();
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const loadContacts = useCallback(async (replace: boolean, cursor?: string) => {
    if (!replace) setLoadingMore(true);
    try {
      const response = await fetch(inboxUrl(filters, cursor));
      const payload = (await response.json().catch(() => ({}))) as InboxPayload;
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load inbox");
      setContacts((current) => replace ? payload.data!.contacts : mergeContacts(current, payload.data!.contacts));
      setMembers(payload.data.members ?? []);
      setNextCursor(payload.data.nextCursor);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load inbox");
    } finally {
      setLoaded(true);
      setLoadingMore(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadContacts(true); }, filters.query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadContacts, filters.query]);

  const selected = contacts.find((contact) => contact.id === selectedId) ?? null;
  const labels = useMemo(() => Array.from(new Set(contacts.flatMap((contact) => contact.tags))).sort(), [contacts]);

  async function patchContact(contactId: string, operation: InboxOperation | { action: "mark_read" }) {
    const previous = contacts;
    if (operation.action === "mark_read") {
      setContacts((current) => current.map((contact) => contact.id === contactId ? { ...contact, unread: false } : contact));
    } else {
      setContacts((current) => current.map((contact) => contact.id === contactId ? optimisticContact(contact, operation) : contact));
    }
    try {
      const response = await fetch(`/api/inbox/${contactId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(operation),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not update conversation");
    } catch (caught) {
      setContacts(previous);
      setError(caught instanceof Error ? caught.message : "Could not update conversation");
    }
  }

  async function openConversation(contact: InboxContact) {
    setSelectedId(contact.id);
    setConversationLoading(true);
    setMessages([]);
    setMessageCursor(undefined);
    setError("");
    try {
      const response = await fetch(`/api/inbox/${contact.id}`);
      const payload = (await response.json().catch(() => ({}))) as ConversationPayload;
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load conversation");
      setMessages(payload.data.messages);
      setMessageCursor(payload.data.nextCursor);
      if (contact.unread) void patchContact(contact.id, { action: "mark_read" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load conversation");
    } finally {
      setConversationLoading(false);
    }
  }

  async function loadEarlier() {
    if (!selected || !messageCursor || olderLoading) return;
    setOlderLoading(true);
    try {
      const response = await fetch(`/api/inbox/${selected.id}?cursor=${encodeURIComponent(messageCursor)}`);
      const payload = (await response.json().catch(() => ({}))) as ConversationPayload;
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load earlier messages");
      setMessages((current) => mergeMessages(payload.data!.messages, current));
      setMessageCursor(payload.data.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load earlier messages");
    } finally {
      setOlderLoading(false);
    }
  }

  useEffect(() => {
    if (typeof messageEndRef.current?.scrollIntoView === "function") messageEndRef.current.scrollIntoView({ block: "nearest" });
  }, [messages]);

  async function sendMessage() {
    if (!selected || !selected.canMessage || !draft.trim() || sending) return;
    const text = draft.trim();
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/inbox/${selected.id}`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ text }),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: { message: InboxMessage }; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not send message");
      setMessages((current) => [...current, payload.data!.message]);
      setContacts((current) => current.map((contact) => contact.id === selected.id
        ? { ...contact, preview: text, lastMessageAt: payload.data!.message.at, inboxStatus: "OPEN" }
        : contact));
      setDraft("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send message");
    } finally {
      setSending(false);
    }
  }

  if (!loaded) return <ActivityContentSkeleton />;
  if (error && contacts.length === 0) return <p className="form-error" role="alert">{error}</p>;

  return <section className={`conversation-desk ${selected ? "has-conversation" : ""}`} aria-label="Instagram inbox conversations">
    <aside className="conversation-roster" aria-label="Contacts">
      <div className="conversation-roster-head">
        <div><h2>Instagram</h2><span>{contacts.length}{nextCursor ? "+" : ""} contact{contacts.length === 1 ? "" : "s"}</span></div>
        <InboxFilters value={filters} labels={labels} onChange={(next) => { setSelectedId(null); setFilters(next); }} />
      </div>
      {contacts.length === 0 ? <div className="conversation-roster-empty"><Inbox size={21} /><p>No conversations match these filters.</p></div> : <>
        <ul className="conversation-contact-list">
          {contacts.map((contact) => <li key={contact.id}>
            <button type="button" className={selectedId === contact.id ? "is-selected" : ""} aria-label={`Open conversation with ${displayName(contact)}`} onClick={() => void openConversation(contact)}>
              <span className="conversation-avatar-wrap"><SocialAvatar channel="instagram" name={displayName(contact)} src={contact.avatarUrl} />{contact.unread && <span className="conversation-unread-dot" aria-label="Unread" />}</span>
              <span className="conversation-contact-copy">
                <span className="conversation-contact-topline"><strong>{displayName(contact)}</strong>{contact.favorite && <span aria-label="Favourite">★</span>}<time dateTime={contact.lastMessageAt}>{formatListTime(contact.lastMessageAt)}</time></span>
                <span className="conversation-preview">{contact.preview}</span>
                <span className="conversation-contact-state">{contact.inboxStatus === "OPEN" ? "Open" : "Closed"}{contact.assigneeUserId ? " · Assigned" : " · Unassigned"}</span>
              </span>
            </button>
          </li>)}
        </ul>
        {nextCursor && <button className="conversation-load-more" type="button" aria-label="Load more conversations" disabled={loadingMore} onClick={() => void loadContacts(false, nextCursor)}>{loadingMore ? "Loading…" : "Load more conversations"}</button>}
      </>}
    </aside>

    <div className="conversation-panel">
      {!selected ? <div className="conversation-blank"><span><Inbox size={24} /></span><h2>Your conversations live here</h2><p>Select any contact to read the history and reply.</p></div> : <>
        <header className="conversation-header">
          <button className="conversation-back" type="button" aria-label="Back to contacts" onClick={() => setSelectedId(null)}><ArrowLeft size={19} /></button>
          <SocialAvatar channel="instagram" name={displayName(selected)} src={selected.avatarUrl} />
          <div className="conversation-header-copy"><h2>{displayName(selected)}</h2><p>{selected.canMessage ? "Instagram · Available to reply" : "Instagram · Reply window closed"}</p></div>
          <ConversationHeaderActions contact={selected} members={members} onOperation={(operation) => void patchContact(selected.id, operation)} />
          <button className="icon-button conversation-info" type="button" aria-label={`View details for ${displayName(selected)}`} onClick={() => setOpenContactId(selected.id)}><Info size={18} /></button>
        </header>
        <div className="conversation-messages" aria-label={`Conversation with ${displayName(selected)}`} aria-live="polite">
          {messageCursor && <button className="conversation-load-earlier" type="button" aria-label="Load earlier messages" disabled={olderLoading} onClick={() => void loadEarlier()}>{olderLoading ? "Loading…" : "Load earlier messages"}</button>}
          {conversationLoading ? <div className="conversation-loading">Loading conversation…</div> : messages.length === 0 ? <div className="conversation-empty"><p>No messages with this contact yet.</p></div> : messages.map((message) => <article className={`conversation-message is-${message.direction}`} key={message.id}>
            <p>{message.text}</p><footer><time dateTime={message.at}>{formatMessageTime(message.at)}</time>{message.direction === "outbound" && <span>{message.status}</span>}</footer>{message.error && <small>{message.error}</small>}
          </article>)}
          <div ref={messageEndRef} />
        </div>
        <div className="conversation-compose">
          {!selected.canMessage && <p className="conversation-window-note">The 24-hour Instagram reply window has closed. This contact can message you to reopen it.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="conversation-compose-row">
            <textarea aria-label={`Message ${displayName(selected)}`} placeholder={selected.canMessage ? "Write a reply…" : "Waiting for this contact to message again"} rows={2} maxLength={1000} value={draft} disabled={!selected.canMessage || sending} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} />
            <button type="button" aria-label="Send message" onClick={() => void sendMessage()} disabled={!selected.canMessage || !draft.trim() || sending}><Send size={18} /><span>{sending ? "Sending" : "Send"}</span></button>
          </div>
          <small>Text only · {draft.length}/1000 · Enter to send, Shift+Enter for a new line</small>
        </div>
      </>}
    </div>
    {openContactId && <ContactDetailModal contactId={openContactId} onClose={() => setOpenContactId(null)} />}
  </section>;
}
