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

type InboxPayload = { data?: { contacts: InboxContact[]; members?: InboxMember[]; nextCursor?: string; needsProfileEnrichment?: boolean }; error?: string };
type ConversationPayload = { data?: { messages: InboxMessage[]; nextCursor?: string }; error?: string };

type InboxListSnapshot = {
  contacts: InboxContact[];
  members: InboxMember[];
  nextCursor?: string;
  fetchedAt: number;
  // Fetcher identity ties the cache to the current session/test stub; a
  // swapped global fetch (new login, new test) implicitly invalidates it.
  fetcher?: typeof fetch;
};

// Stale-while-revalidate per filter set, mirroring src/lib/client/workspace-data.ts:
// revisiting the inbox paints the last roster instantly while a background
// refresh runs, instead of skeleton-flashing on every navigation.
const INBOX_FRESH_FOR_MS = 120_000;
const INBOX_CACHE_LIMIT = 20;
const inboxFirstPageCache = new Map<string, InboxListSnapshot>();

function inboxCacheKey(filters: InboxFiltersValue): string {
  return JSON.stringify(filters);
}

function readInboxCache(filters: InboxFiltersValue): { snapshot?: InboxListSnapshot; fresh: boolean } {
  const snapshot = inboxFirstPageCache.get(inboxCacheKey(filters));
  if (!snapshot || snapshot.fetcher !== fetch) return { fresh: false };
  return { snapshot, fresh: Date.now() - snapshot.fetchedAt < INBOX_FRESH_FOR_MS };
}

function writeInboxCache(filters: InboxFiltersValue, snapshot: Omit<InboxListSnapshot, "fetchedAt" | "fetcher">): void {
  while (inboxFirstPageCache.size >= INBOX_CACHE_LIMIT) {
    const oldest = inboxFirstPageCache.keys().next().value;
    if (oldest === undefined) break;
    inboxFirstPageCache.delete(oldest);
  }
  inboxFirstPageCache.set(inboxCacheKey(filters), { ...snapshot, fetchedAt: Date.now(), fetcher: fetch });
}

/** Applies the same optimistic operation to the cached roster so a revisit
 *  inside the freshness window doesn't briefly resurrect pre-PATCH state. */
function mutateInboxCache(filters: InboxFiltersValue, contactId: string, operation: InboxOperation | { action: "mark_read" }): (() => void) | undefined {
  const snapshot = inboxFirstPageCache.get(inboxCacheKey(filters));
  if (!snapshot || snapshot.fetcher !== fetch) return undefined;
  const previous = snapshot.contacts;
  snapshot.contacts = previous.map((contact) => contact.id !== contactId ? contact
    : operation.action === "mark_read" ? { ...contact, unread: false } : optimisticContact(contact, operation));
  return () => { snapshot.contacts = previous; };
}

/** A contact-first, text-only Instagram conversation desk. */
export function InstagramInbox() {
  const [contacts, setContacts] = useState<InboxContact[]>(() => readInboxCache(DEFAULT_FILTERS).snapshot?.contacts ?? []);
  const [members, setMembers] = useState<InboxMember[]>(() => readInboxCache(DEFAULT_FILTERS).snapshot?.members ?? []);
  const [nextCursor, setNextCursor] = useState<string | undefined>(() => readInboxCache(DEFAULT_FILTERS).snapshot?.nextCursor);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<string>();
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(() => readInboxCache(DEFAULT_FILTERS).snapshot !== undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const contactsAbortRef = useRef<AbortController | null>(null);
  const conversationAbortRef = useRef<AbortController | null>(null);
  const activeContactIdRef = useRef<string | null>(null);

  const loadContacts = useCallback(async (replace: boolean, cursor?: string) => {
    const isFirstPage = replace && !cursor;
    contactsAbortRef.current?.abort();
    const controller = new AbortController();
    contactsAbortRef.current = controller;
    if (isFirstPage) {
      const { snapshot, fresh } = readInboxCache(filters);
      if (snapshot) {
        // Paint instantly; a fresh snapshot needs no network at all, a stale
        // one stays on screen while the refresh below replaces it.
        setContacts(snapshot.contacts);
        setMembers(snapshot.members);
        setNextCursor(snapshot.nextCursor);
        setError("");
        setLoaded(true);
        if (fresh) return;
      }
    }
    if (!replace) setLoadingMore(true);
    try {
      const response = await fetch(inboxUrl(filters, cursor), { signal: controller.signal });
      const payload = (await response.json().catch(() => ({}))) as InboxPayload;
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load inbox");
      if (controller.signal.aborted || contactsAbortRef.current !== controller) return;
      setContacts((current) => replace ? payload.data!.contacts : mergeContacts(current, payload.data!.contacts));
      setMembers(payload.data.members ?? []);
      setNextCursor(payload.data.nextCursor);
      if (isFirstPage) {
        writeInboxCache(filters, {
          contacts: payload.data.contacts,
          members: payload.data.members ?? [],
          nextCursor: payload.data.nextCursor,
        });
        if (payload.data.needsProfileEnrichment) {
          const enrichUrl = new URL(inboxUrl(filters), window.location.origin);
          enrichUrl.searchParams.set("enrich", "1");
          void fetch(enrichUrl.pathname + enrichUrl.search, { signal: controller.signal })
            .then(async (response) => response.ok ? (await response.json() as InboxPayload).data : undefined)
            .then((enriched) => {
              if (!enriched || controller.signal.aborted || contactsAbortRef.current !== controller) return;
              const details = new Map(enriched.contacts.map((contact) => [contact.id, contact]));
              setContacts((current) => {
                const next = current.map((contact) => ({ ...contact, username: details.get(contact.id)?.username ?? contact.username, avatarUrl: details.get(contact.id)?.avatarUrl || contact.avatarUrl }));
                writeInboxCache(filters, { contacts: next, members: payload.data!.members ?? [], nextCursor: payload.data!.nextCursor });
                return next;
              });
            }).catch(() => undefined);
        }
      }
      setError("");
    } catch (caught) {
      if (controller.signal.aborted || contactsAbortRef.current !== controller) return;
      setError(caught instanceof Error ? caught.message : "Could not load inbox");
    } finally {
      if (!controller.signal.aborted && contactsAbortRef.current === controller) {
        setLoaded(true);
        setLoadingMore(false);
        setFilterLoading(false);
      }
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadContacts(true); }, filters.query ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      contactsAbortRef.current?.abort();
    };
  }, [loadContacts, filters.query]);

  useEffect(() => () => {
    conversationAbortRef.current?.abort();
  }, []);

  const selected = contacts.find((contact) => contact.id === selectedId) ?? null;
  const labels = useMemo(() => Array.from(new Set(contacts.flatMap((contact) => contact.tags))).sort(), [contacts]);

  async function patchContact(contactId: string, operation: InboxOperation | { action: "mark_read" }) {
    const previous = contacts;
    const rollbackCache = mutateInboxCache(filters, contactId, operation);
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
      rollbackCache?.();
      setError(caught instanceof Error ? caught.message : "Could not update conversation");
    }
  }

  async function openConversation(contact: InboxContact) {
    conversationAbortRef.current?.abort();
    const controller = new AbortController();
    conversationAbortRef.current = controller;
    activeContactIdRef.current = contact.id;
    setSelectedId(contact.id);
    setConversationLoading(true);
    setMessages([]);
    setMessageCursor(undefined);
    setError("");
    autoScrollRef.current = true;
    try {
      const response = await fetch(`/api/inbox/${contact.id}`, { signal: controller.signal });
      const payload = (await response.json().catch(() => ({}))) as ConversationPayload;
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load conversation");
      if (controller.signal.aborted || activeContactIdRef.current !== contact.id) return;
      setMessages(payload.data.messages);
      setMessageCursor(payload.data.nextCursor);
      if (contact.unread) void patchContact(contact.id, { action: "mark_read" });
    } catch (caught) {
      if (controller.signal.aborted || activeContactIdRef.current !== contact.id) return;
      setError(caught instanceof Error ? caught.message : "Could not load conversation");
    } finally {
      if (!controller.signal.aborted && activeContactIdRef.current === contact.id) setConversationLoading(false);
    }
  }

  async function loadEarlier() {
    if (!selected || !messageCursor || olderLoading) return;
    setOlderLoading(true);
    autoScrollRef.current = false;
    const container = messagesRef.current;
    const previousScrollHeight = container?.scrollHeight ?? 0;
    const previousScrollTop = container?.scrollTop ?? 0;
    try {
      const response = await fetch(`/api/inbox/${selected.id}?cursor=${encodeURIComponent(messageCursor)}`);
      const payload = (await response.json().catch(() => ({}))) as ConversationPayload;
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load earlier messages");
      setMessages((current) => mergeMessages(payload.data!.messages, current));
      setMessageCursor(payload.data.nextCursor);
      requestAnimationFrame(() => {
        const element = messagesRef.current;
        if (element) element.scrollTop = previousScrollTop + (element.scrollHeight - previousScrollHeight);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load earlier messages");
    } finally {
      setOlderLoading(false);
    }
  }

  useEffect(() => {
    if (!autoScrollRef.current) return;
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
      autoScrollRef.current = true;
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

  return <section className={`conversation-desk ${selected ? "has-conversation" : ""}`} aria-label="Instagram inbox conversations">
    <aside className="conversation-roster" aria-label="Contacts">
      <div className="conversation-roster-head">
        <div><h2>Conversations</h2><span>{contacts.length}{nextCursor ? "+" : ""} contact{contacts.length === 1 ? "" : "s"}</span></div>
        <InboxFilters value={filters} labels={labels} onChange={(next) => {
          conversationAbortRef.current?.abort(); activeContactIdRef.current = null; setSelectedId(null);
          const snapshot = readInboxCache(next).snapshot;
          setContacts(snapshot?.contacts ?? []); setMembers(snapshot?.members ?? []);
          setNextCursor(snapshot?.nextCursor); setFilterLoading(!snapshot); setFilters(next);
        }} />
      </div>
      {error && contacts.length === 0 && <p className="form-error" role="alert">{error}</p>}
      {filterLoading ? <div className="conversation-filter-loading" aria-label="Loading conversations" aria-busy="true">{[0, 1, 2, 3].map((index) => <div className="skeleton-list-row is-compact" key={index}><span className="skeleton-block skeleton-avatar" /><span className="skeleton-stack skeleton-row-copy"><span className="skeleton-block skeleton-word skeleton-row-title" /><span className="skeleton-block skeleton-word skeleton-row-meta" /></span></div>)}</div> : contacts.length === 0 ? <div className="conversation-roster-empty"><Inbox size={21} /><p>No conversations match these filters.</p></div> : <>
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
      {!selected ? <div className="conversation-blank"><span><Inbox size={24} /></span><small>Ready for your next reply</small><h2>Choose a conversation</h2><p>Select someone on the left to read their messages, manage the conversation, and reply.</p></div> : <>
        <header className="conversation-header">
          <button className="conversation-back" type="button" aria-label="Back to contacts" onClick={() => { conversationAbortRef.current?.abort(); activeContactIdRef.current = null; setSelectedId(null); }}><ArrowLeft size={19} /></button>
          <SocialAvatar channel="instagram" name={displayName(selected)} src={selected.avatarUrl} />
          <div className="conversation-header-copy"><h2>{displayName(selected)}</h2><p>{selected.canMessage ? "Instagram · Available to reply" : "Instagram · Reply window closed"}</p></div>
          <ConversationHeaderActions contact={selected} members={members} onOperation={(operation) => void patchContact(selected.id, operation)} />
          <button className="icon-button conversation-info" type="button" aria-label={`View details for ${displayName(selected)}`} onClick={() => setOpenContactId(selected.id)}><Info size={18} /></button>
        </header>
        <div className="conversation-messages" ref={messagesRef} aria-label={`Conversation with ${displayName(selected)}`} aria-live="polite">
          {messageCursor && <button className="conversation-load-earlier" type="button" aria-label="Load earlier messages" disabled={olderLoading} onClick={() => void loadEarlier()}>{olderLoading ? "Loading…" : "Load earlier messages"}</button>}
          {conversationLoading ? <div className="conversation-loading" aria-label="Loading conversation" aria-busy="true"><span className="skeleton-block conversation-message-skeleton" /><span className="skeleton-block conversation-message-skeleton is-reply" /><span className="skeleton-block conversation-message-skeleton" /></div> : messages.length === 0 ? <div className="conversation-empty"><p>No messages with this contact yet.</p></div> : messages.map((message) => <article className={`conversation-message is-${message.direction}`} key={message.id}>
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
