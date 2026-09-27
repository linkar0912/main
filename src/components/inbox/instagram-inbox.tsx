"use client";

import { Fragment, useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowUp, BellRing, Check, Clock3, Inbox, Info, PauseCircle, RotateCcw, Star, UserRound } from "lucide-react";
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
const MAX_MESSAGE_LENGTH = 1_000;
/** Messages this close together from the same side read as one burst. */
const GROUP_GAP_MS = 5 * 60_000;

function displayName(contact: InboxContact): string {
  return contact.username ? `@${contact.username.replace(/^@+/, "")}` : `Instagram contact ·${contact.id.slice(-5)}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function daysAgo(value: string): number {
  return Math.round((startOfDay(new Date()) - startOfDay(new Date(value))) / 86_400_000);
}

function formatListTime(value: string): string {
  const date = new Date(value);
  const age = daysAgo(value);
  if (age <= 0) return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (age === 1) return "Yesterday";
  if (age < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDayLabel(value: string): string {
  const age = daysAgo(value);
  if (age <= 0) return "Today";
  if (age === 1) return "Yesterday";
  const date = new Date(value);
  return date.toLocaleDateString(undefined, age < 7 ? { weekday: "long" } : { weekday: "short", month: "short", day: "numeric", ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

function formatBubbleTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function isReminderDue(value?: string): boolean {
  return value ? Date.parse(value) <= Date.now() : false;
}

function formatReminder(value: string): string {
  if (isReminderDue(value)) return "Reminder due";
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isAutomationPaused(contact: InboxContact): boolean {
  return Boolean(contact.automationsPausedUntil && Date.parse(contact.automationsPausedUntil) > Date.now());
}

function formatPauseEnd(value: string): string {
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
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

/**
 * Folds the newest server page of a conversation into what's on screen.
 * Server rows win for anything they both hold (status updates), messages
 * from older pages stay, and an optimistic bubble still in flight is kept
 * while its server copy is hidden so the send never shows twice.
 */
export function mergeLiveMessages(current: InboxMessage[], latest: InboxMessage[]): InboxMessage[] {
  const local = current.filter((message) => message.id.startsWith("local_"));
  const inFlightTexts = new Set(local.map((message) => message.text));
  const byId = new Map<string, InboxMessage>();
  for (const message of current) {
    if (!message.id.startsWith("local_")) byId.set(message.id, message);
  }
  for (const message of latest) {
    if (message.direction === "outbound" && inFlightTexts.has(message.text) && !byId.has(message.id)) continue;
    const existing = byId.get(message.id);
    byId.set(message.id, existing?.clientKey ? { ...message, clientKey: existing.clientKey } : message);
  }
  const settled = [...byId.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return [...settled, ...local];
}

/** Keeps pages already scrolled into view while the first page refreshes in place. */
export function mergeLiveContacts(current: InboxContact[], firstPage: InboxContact[]): InboxContact[] {
  const fresh = new Set(firstPage.map((contact) => contact.id));
  return [...firstPage, ...current.filter((contact) => !fresh.has(contact.id))];
}

function optimisticContact(contact: InboxContact, operation: InboxOperation): InboxContact {
  if (operation.action === "set_status") return { ...contact, inboxStatus: operation.status };
  if (operation.action === "set_favorite") return { ...contact, favorite: operation.favorite };
  if (operation.action === "set_reminder") return { ...contact, reminderAt: operation.reminderAt ?? undefined };
  return { ...contact, assigneeUserId: operation.assigneeUserId ?? undefined };
}

function newClientKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
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
/** How often an open inbox checks for new messages while the tab is visible. */
export const INBOX_LIVE_REFRESH_MS = 8_000;
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

/** Applies the same optimistic change to the cached roster so a revisit
 *  inside the freshness window doesn't briefly resurrect pre-PATCH state. */
function mutateInboxCache(filters: InboxFiltersValue, contactId: string, update: (contact: InboxContact) => InboxContact): (() => void) | undefined {
  const snapshot = inboxFirstPageCache.get(inboxCacheKey(filters));
  if (!snapshot || snapshot.fetcher !== fetch) return undefined;
  const previous = snapshot.contacts;
  snapshot.contacts = previous.map((contact) => contact.id === contactId ? update(contact) : contact);
  return () => { snapshot.contacts = previous; };
}

type MessageGroup = { key: string; day?: string; direction: InboxMessage["direction"]; messages: InboxMessage[] };

/** Splits a thread into day sections and same-sender bursts. */
function groupMessages(messages: InboxMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let lastDay = "";
  for (const message of messages) {
    const day = new Date(message.at).toDateString();
    const previous = groups.at(-1);
    const lastAt = previous?.messages.at(-1)?.at;
    const continues = previous
      && day === lastDay
      && previous.direction === message.direction
      && lastAt !== undefined
      && Math.abs(Date.parse(message.at) - Date.parse(lastAt)) < GROUP_GAP_MS;
    if (continues) {
      previous.messages.push(message);
    } else {
      groups.push({ key: message.id, direction: message.direction, messages: [message], ...(day !== lastDay ? { day: message.at } : {}) });
    }
    lastDay = day;
  }
  return groups;
}

function DeliveryState({ message, onRetry }: { message: InboxMessage; onRetry: (message: InboxMessage) => void }) {
  if (message.direction !== "outbound") return null;
  if (message.status === "sending") return <span className="ibx-state is-sending"><Clock3 size={12} aria-hidden="true" />Sending</span>;
  if (message.status === "failed") {
    return <span className="ibx-state is-failed">
      <AlertCircle size={12} aria-hidden="true" />Not sent
      {message.clientKey && <button type="button" onClick={() => onRetry(message)}><RotateCcw size={12} aria-hidden="true" />Retry</button>}
    </span>;
  }
  if (message.status === "unknown") return <span className="ibx-state">Delivery unconfirmed</span>;
  return <span className="ibx-state is-sent"><Check size={12} aria-hidden="true" />Sent</span>;
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
  const [listError, setListError] = useState("");
  const [threadError, setThreadError] = useState("");
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
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
        setListError("");
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
      setListError("");
    } catch (caught) {
      if (controller.signal.aborted || contactsAbortRef.current !== controller) return;
      setListError(caught instanceof Error ? caught.message : "Could not load inbox");
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

  // Live updates: new DMs and replies show up without a reload. Polls quietly
  // while the tab is visible (and immediately when it becomes visible again),
  // never while a page of results or a conversation is still loading.
  const liveBusy = loadingMore || filterLoading || conversationLoading || olderLoading;
  const liveGuardRef = useRef({ filtersKey: inboxCacheKey(DEFAULT_FILTERS), busy: false, inFlight: false });
  useEffect(() => {
    liveGuardRef.current.filtersKey = inboxCacheKey(filters);
    liveGuardRef.current.busy = liveBusy;
  }, [filters, liveBusy]);
  const refreshLive = useEffectEvent(async () => {
    const guard = liveGuardRef.current;
    if (guard.inFlight || liveBusy || document.visibilityState !== "visible") return;
    guard.inFlight = true;
    const requestFilters = filters;
    const requestKey = inboxCacheKey(filters);
    const openId = selectedId;
    const stillCurrent = () => guard.filtersKey === requestKey && !guard.busy;
    try {
      const listResponse = await fetch(inboxUrl(requestFilters));
      const listPayload = (await listResponse.json().catch(() => ({}))) as InboxPayload;
      if (listResponse.ok && listPayload.data && stillCurrent()) {
        const page = listPayload.data;
        setContacts((existing) => mergeLiveContacts(existing, page.contacts));
        if (page.members) setMembers(page.members);
        writeInboxCache(requestFilters, { contacts: page.contacts, members: page.members ?? [], nextCursor: page.nextCursor });
      }
      if (openId && activeContactIdRef.current === openId) {
        const threadResponse = await fetch(`/api/inbox/${openId}`);
        const threadPayload = (await threadResponse.json().catch(() => ({}))) as ConversationPayload;
        if (threadResponse.ok && threadPayload.data && activeContactIdRef.current === openId && !guard.busy) {
          const latest = threadPayload.data.messages;
          setMessages((existing) => mergeLiveMessages(existing, latest));
          const openContact = listPayload.data?.contacts.find((contact) => contact.id === openId);
          if (openContact?.unread) void patchContact(openId, { action: "mark_read" });
        }
      }
    } catch {
      // Live refresh is opportunistic; the next tick (or a manual action) retries.
    } finally {
      guard.inFlight = false;
    }
  });
  useEffect(() => {
    const timer = window.setInterval(() => void refreshLive(), INBOX_LIVE_REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void refreshLive(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const selected = contacts.find((contact) => contact.id === selectedId) ?? null;
  const labels = useMemo(() => Array.from(new Set(contacts.flatMap((contact) => contact.tags))).sort(), [contacts]);
  const memberNames = useMemo(() => new Map(members.map((member) => [member.userId, member.email.split("@")[0]])), [members]);
  const groups = useMemo(() => groupMessages(messages), [messages]);
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  function updateContact(contactId: string, update: (contact: InboxContact) => InboxContact) {
    setContacts((current) => current.map((contact) => contact.id === contactId ? update(contact) : contact));
    return mutateInboxCache(filters, contactId, update);
  }

  async function patchContact(contactId: string, operation: InboxOperation | { action: "mark_read" }) {
    const previous = contacts;
    const rollbackCache = updateContact(contactId, (contact) => operation.action === "mark_read" ? { ...contact, unread: false } : optimisticContact(contact, operation));
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
      setThreadError(caught instanceof Error ? caught.message : "Could not update conversation");
    }
  }

  const [resumingId, setResumingId] = useState<string | null>(null);

  async function resumeAutomations(contactId: string) {
    setResumingId(contactId);
    try {
      const response = await fetch(`/api/contacts/${contactId}/handoff`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not resume automations");
      updateContact(contactId, (contact) => ({ ...contact, automationsPausedUntil: undefined }));
    } catch (caught) {
      setThreadError(caught instanceof Error ? caught.message : "Could not resume automations");
    } finally {
      setResumingId(null);
    }
  }

  function closeConversation() {
    conversationAbortRef.current?.abort();
    activeContactIdRef.current = null;
    setSelectedId(null);
    setThreadError("");
  }

  async function openConversation(contact: InboxContact) {
    if (activeContactIdRef.current === contact.id && !threadError) return;
    conversationAbortRef.current?.abort();
    const controller = new AbortController();
    conversationAbortRef.current = controller;
    activeContactIdRef.current = contact.id;
    setSelectedId(contact.id);
    setConversationLoading(true);
    setMessages([]);
    setMessageCursor(undefined);
    setThreadError("");
    setDraft("");
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
      setThreadError(caught instanceof Error ? caught.message : "Could not load conversation");
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
      setThreadError(caught instanceof Error ? caught.message : "Could not load earlier messages");
    } finally {
      setOlderLoading(false);
    }
  }

  useEffect(() => {
    if (!autoScrollRef.current) return;
    if (typeof messageEndRef.current?.scrollIntoView === "function") messageEndRef.current.scrollIntoView({ block: "nearest" });
  }, [messages]);

  // Grow the composer with its content, up to the CSS max-height.
  useLayoutEffect(() => {
    const element = composerRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft, selectedId]);

  /** Posts one message. The bubble is already on screen; this only settles it. */
  async function deliver(contactId: string, pending: InboxMessage) {
    try {
      const response = await fetch(`/api/inbox/${contactId}`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": pending.clientKey! },
        body: JSON.stringify({ text: pending.text }),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: { message: InboxMessage; automationsPausedUntil?: string }; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not send message");
      const sent = payload.data.message;
      if (activeContactIdRef.current === contactId) {
        setMessages((current) => current.map((message) => message.id === pending.id ? { ...sent, clientKey: pending.clientKey } : message));
      }
      const pausedUntil = payload.data.automationsPausedUntil;
      updateContact(contactId, (contact) => ({
        ...contact,
        preview: pending.text,
        lastMessageAt: sent.at,
        inboxStatus: "OPEN",
        ...(pausedUntil ? { automationsPausedUntil: pausedUntil } : {}),
      }));
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : "Could not send message";
      if (activeContactIdRef.current === contactId) {
        setMessages((current) => current.map((message) => message.id === pending.id ? { ...message, status: "failed", error: reason } : message));
      }
    }
  }

  function sendMessage() {
    const text = draft.trim();
    if (!selected || !selected.canMessage || !text || text.length > MAX_MESSAGE_LENGTH) return;
    const clientKey = newClientKey();
    const pending: InboxMessage = { id: `local_${clientKey}`, direction: "outbound", text, at: new Date().toISOString(), status: "sending", clientKey };
    autoScrollRef.current = true;
    setMessages((current) => [...current, pending]);
    setDraft("");
    setThreadError("");
    void deliver(selected.id, pending);
  }

  function retryMessage(message: InboxMessage) {
    if (!selected || !message.clientKey) return;
    const pending = { ...message, status: "sending" as const, error: undefined };
    setMessages((current) => current.map((candidate) => candidate.id === message.id ? pending : candidate));
    // Same idempotency key: if the first attempt actually reached Meta, the
    // server returns that delivery instead of sending a duplicate.
    void deliver(selected.id, pending);
  }

  if (!loaded) return <ActivityContentSkeleton />;

  const tooLong = draft.trim().length > MAX_MESSAGE_LENGTH;

  return <section className={`ibx-desk ${selected ? "has-thread" : ""}`} aria-label="Instagram inbox conversations">
    <aside className="ibx-list" aria-label="Contacts">
      <div className="ibx-list-head">
        <div className="ibx-list-title">
          <h2>Messages</h2>
          <span>{contacts.length}{nextCursor ? "+" : ""} {contacts.length === 1 && !nextCursor ? "person" : "people"}</span>
        </div>
        <InboxFilters value={filters} labels={labels} onChange={(next) => {
          closeConversation();
          const snapshot = readInboxCache(next).snapshot;
          setContacts(snapshot?.contacts ?? []); setMembers(snapshot?.members ?? []);
          setNextCursor(snapshot?.nextCursor); setFilterLoading(!snapshot); setFilters(next);
        }} />
      </div>

      <div className="ibx-list-body">
        {listError && <p className="ibx-banner is-error" role="alert"><AlertCircle size={15} aria-hidden="true" />{listError}<button type="button" onClick={() => void loadContacts(true)}>Try again</button></p>}
        {filterLoading ? <div className="ibx-list-loading" aria-label="Loading conversations" aria-busy="true">
          {[0, 1, 2, 3, 4].map((index) => <div className="ibx-row-skeleton" key={index}><span className="skeleton-block skeleton-avatar" /><span className="skeleton-stack skeleton-row-copy"><span className="skeleton-block skeleton-word skeleton-row-title" /><span className="skeleton-block skeleton-word skeleton-row-meta" /></span></div>)}
        </div> : contacts.length === 0 ? <div className="ibx-list-empty">
          <Inbox size={22} aria-hidden="true" />
          {filtersActive ? <>
            <p>No conversations match these filters.</p>
            <button type="button" className="ibx-link-button" onClick={() => { setFilterLoading(!readInboxCache(DEFAULT_FILTERS).snapshot); setFilters(DEFAULT_FILTERS); }}>Clear filters</button>
          </> : <p>No messages yet. When someone DMs your Instagram account, they show up here.</p>}
        </div> : <>
          <ul className="ibx-rows">
            {contacts.map((contact) => {
              const assignee = contact.assigneeUserId ? memberNames.get(contact.assigneeUserId) ?? "Assigned" : undefined;
              const reminderDue = isReminderDue(contact.reminderAt);
              return <li key={contact.id}>
                <button type="button" className={`ibx-row ${selectedId === contact.id ? "is-selected" : ""} ${contact.unread ? "is-unread" : ""}`} aria-current={selectedId === contact.id ? "true" : undefined} aria-label={`Open conversation with ${displayName(contact)}`} onClick={() => void openConversation(contact)}>
                  <span className="ibx-avatar"><SocialAvatar channel="instagram" name={displayName(contact)} src={contact.avatarUrl} />{contact.unread && <span className="ibx-unread-dot" aria-label="Unread" />}</span>
                  <span className="ibx-row-copy">
                    <span className="ibx-row-top">
                      <strong>{displayName(contact)}</strong>
                      {contact.favorite && <Star className="ibx-row-star" size={12} fill="currentColor" aria-label="Favourite" />}
                      <time dateTime={contact.lastMessageAt}>{formatListTime(contact.lastMessageAt)}</time>
                    </span>
                    <span className="ibx-row-preview">{contact.preview}</span>
                    {(contact.inboxStatus === "CLOSED" || assignee || contact.reminderAt || !contact.canMessage || isAutomationPaused(contact)) && <span className="ibx-row-tags">
                      {contact.inboxStatus === "CLOSED" && <span className="ibx-tag">Closed</span>}
                      {contact.reminderAt && <span className={`ibx-tag ${reminderDue ? "is-due" : ""}`}><BellRing size={11} aria-hidden="true" />{formatReminder(contact.reminderAt)}</span>}
                      {assignee && <span className="ibx-tag"><UserRound size={11} aria-hidden="true" />{assignee}</span>}
                      {!contact.canMessage && contact.inboxStatus !== "CLOSED" && <span className="ibx-tag is-muted">Window closed</span>}
                      {isAutomationPaused(contact) && <span className="ibx-tag"><PauseCircle size={11} aria-hidden="true" />Bot paused</span>}
                    </span>}
                  </span>
                </button>
              </li>;
            })}
          </ul>
          {nextCursor && <button className="ibx-load-more" type="button" aria-label="Load more conversations" disabled={loadingMore} onClick={() => void loadContacts(false, nextCursor)}>{loadingMore ? "Loading…" : "Load more"}</button>}
        </>}
      </div>
    </aside>

    <div className="ibx-thread">
      {!selected ? <div className="ibx-thread-blank">
        <span className="ibx-blank-mark"><Inbox size={22} aria-hidden="true" /></span>
        <h2>Pick a conversation</h2>
        <p>Choose someone from the list to read the thread and reply.</p>
      </div> : <>
        <header className="ibx-thread-head">
          <button className="ibx-back" type="button" aria-label="Back to contacts" onClick={closeConversation}><ArrowLeft size={19} /></button>
          <button className="ibx-who" type="button" aria-label={`View details for ${displayName(selected)}`} onClick={() => setOpenContactId(selected.id)}>
            <SocialAvatar channel="instagram" name={displayName(selected)} src={selected.avatarUrl} />
            <span className="ibx-who-copy">
              <strong className="ibx-who-name">{displayName(selected)}</strong>
              <span className={`ibx-window ${selected.canMessage ? "is-open" : ""}`}>{selected.canMessage ? "Can reply now" : "Reply window closed"}</span>
            </span>
            <Info className="ibx-who-info" size={16} aria-hidden="true" />
          </button>
          <ConversationHeaderActions contact={selected} members={members} onOperation={(operation) => void patchContact(selected.id, operation)} />
        </header>

        <div className="ibx-messages" ref={messagesRef} aria-label={`Conversation with ${displayName(selected)}`} aria-live="polite">
          {messageCursor && <button className="ibx-load-earlier" type="button" aria-label="Load earlier messages" disabled={olderLoading} onClick={() => void loadEarlier()}>{olderLoading ? "Loading…" : "Load earlier messages"}</button>}
          {conversationLoading ? <div className="ibx-thread-loading" aria-label="Loading conversation" aria-busy="true">
            <span className="skeleton-block ibx-bubble-skeleton" /><span className="skeleton-block ibx-bubble-skeleton is-out" /><span className="skeleton-block ibx-bubble-skeleton is-short" />
          </div> : messages.length === 0 ? <div className="ibx-thread-empty"><p>No messages with this contact yet.</p></div> : groups.map((group) => <Fragment key={group.key}>
            {group.day && <div className="ibx-day" role="separator"><span>{formatDayLabel(group.day)}</span></div>}
            <div className={`ibx-group is-${group.direction}`}>
              {group.messages.map((message, index) => <article className={`ibx-bubble is-${message.direction} ${message.status === "failed" ? "is-failed" : ""} ${message.status === "sending" ? "is-sending" : ""}`} key={message.id}>
                <p>{message.text}</p>
                {index === group.messages.length - 1 && <footer><time dateTime={message.at}>{formatBubbleTime(message.at)}</time><DeliveryState message={message} onRetry={retryMessage} /></footer>}
                {message.error && <small>{message.error}</small>}
              </article>)}
            </div>
          </Fragment>)}
          <div ref={messageEndRef} />
        </div>

        {isAutomationPaused(selected) && <p className="ibx-banner is-paused" role="status">
          <PauseCircle size={15} aria-hidden="true" />
          <span>Automations are paused for {displayName(selected)} until {formatPauseEnd(selected.automationsPausedUntil!)} because someone on your team replied.</span>
          <button type="button" disabled={resumingId === selected.id} onClick={() => void resumeAutomations(selected.id)}>{resumingId === selected.id ? "Resuming…" : "Resume automations"}</button>
        </p>}

        {threadError && <p className="ibx-banner is-error ibx-thread-error" role="alert"><AlertCircle size={15} aria-hidden="true" />{threadError}</p>}

        {selected.canMessage ? <form className="ibx-composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
          <div className={`ibx-composer-field ${tooLong ? "is-over" : ""}`}>
            <textarea ref={composerRef} aria-label={`Message ${displayName(selected)}`} placeholder="Write a reply" rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(); }
            }} />
            <button type="submit" aria-label="Send message" disabled={!draft.trim() || tooLong}><ArrowUp size={18} strokeWidth={2.4} /></button>
          </div>
          <small className="ibx-composer-hint">{draft.length > MAX_MESSAGE_LENGTH * 0.8 ? <span className={tooLong ? "is-over" : ""}>{draft.trim().length}/{MAX_MESSAGE_LENGTH} characters</span> : <span>Enter to send, Shift+Enter for a new line</span>}</small>
        </form> : <div className="ibx-window-note" role="note">
          <Clock3 size={16} aria-hidden="true" />
          <p><strong>The 24-hour Instagram reply window has closed.</strong> You can reply again as soon as {displayName(selected)} sends you a new message.</p>
        </div>}
      </>}
    </div>
    {openContactId && <ContactDetailModal contactId={openContactId} onClose={() => setOpenContactId(null)} />}
  </section>;
}
