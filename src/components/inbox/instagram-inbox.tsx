"use client";

import { Presence } from "@/src/components/ui/use-presence";
import { Fragment, useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowUp, BellRing, Check, ChevronDown, Clock3, ExternalLink, Inbox, Info, MoreHorizontal, PauseCircle, RotateCcw, Star, UserRound } from "lucide-react";
import Link from "next/link";
import { ContactDetailModal, type ContactUpdate } from "../contact-detail-modal";
import { formatDateParts, formatDateTime, formatShortDate, formatTime } from "@/src/lib/format-date";
import { RelativeTime } from "../ui/relative-time";
import { ActivityContentSkeleton } from "../skeleton";
import { Collapse } from "../ui/collapse";
import { SocialAvatar } from "../social-avatar";
import { ConversationHeaderActions, type InboxOperation } from "./conversation-header-actions";
import { InboxFilters } from "./inbox-filters";
import { groupConversations, lastSpeaker, type ConversationGroupKey } from "./conversation-groups";
import type { InboxContact, InboxFiltersValue, InboxMember, InboxMessage } from "./types";
import { toReadableApiError } from "@/src/lib/api-error-message";
import { backoffDelay } from "@/src/lib/client/workspace-data";

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
  // No raw ID suffix: the preview line and time already tell unnamed rows apart.
  return contact.username ? `@${contact.username.replace(/^@+/, "")}` : "Instagram contact";
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function daysAgo(value: string): number {
  return Math.round((startOfDay(new Date()) - startOfDay(new Date(value))) / 86_400_000);
}

function formatListTime(value: string): string {
  const age = daysAgo(value);
  if (age <= 0) return formatTime(value);
  if (age === 1) return "Yesterday";
  if (age < 7) return formatDateParts(value, { weekday: "short" });
  return formatShortDate(value);
}

function formatDayLabel(value: string): string {
  const age = daysAgo(value);
  if (age <= 0) return "Today";
  if (age === 1) return "Yesterday";
  const date = new Date(value);
  return formatDateParts(date, age < 7 ? { weekday: "long" } : { weekday: "short", month: "short", day: "numeric", ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

function formatBubbleTime(value: string): string {
  return formatTime(value);
}

function isReminderDue(value?: string): boolean {
  return value ? Date.parse(value) <= Date.now() : false;
}

/** "Reminder due", or when it is set for ("Tomorrow 10:00") with the full time on hover. */
function ReminderLabel({ value }: { value: string }) {
  if (isReminderDue(value)) return <>Reminder due</>;
  return <RelativeTime value={value} />;
}

function isAutomationPaused(contact: InboxContact): boolean {
  return Boolean(contact.automationsPausedUntil && Date.parse(contact.automationsPausedUntil) > Date.now());
}

function formatPauseEnd(value: string): string {
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? formatTime(date)
    : formatDateParts(date, { weekday: "short", hour: "numeric", minute: "2-digit" });
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
/** Failed checks back off from that, doubling each time, up to this. */
export const INBOX_LIVE_REFRESH_MAX_MS = 120_000;
/** Each request of a live check gives up after this long, and the check counts as failed. */
export const INBOX_LIVE_TIMEOUT_MS = 15_000;
/**
 * While checks back off, a tab coming back into view checks once at once
 * if the last attempt is at least this old (or as soon as it is), instead
 * of waiting out a backoff of up to two minutes.
 */
const INBOX_VISIBLE_RECHECK_MS = 2 * INBOX_LIVE_REFRESH_MS;
const INBOX_CACHE_LIMIT = 20;
const inboxFirstPageCache = new Map<string, InboxListSnapshot>();

/**
 * The wait before the next live check: the normal pace while checks work,
 * then twice as long after each failure in a row (16 s, 32 s... up to two
 * minutes, spread a little so open tabs do not retry together).
 */
export function liveRefreshDelay(failures: number, random: () => number = Math.random): number {
  if (failures <= 0) return INBOX_LIVE_REFRESH_MS;
  return backoffDelay(failures + 1, { baseMs: INBOX_LIVE_REFRESH_MS, capMs: INBOX_LIVE_REFRESH_MAX_MS, random });
}

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

const IMAGE_ATTACHMENTS = new Set(["image", "animated_image_share", "sticker"]);
const ATTACHMENT_LINK_LABELS: Record<string, string> = {
  video: "Watch video",
  audio: "Play voice message",
  file: "Open file",
  share: "Open post",
  ig_post: "Open post",
  ig_reel: "Open reel",
  reel: "Open reel",
};

/** Text plus whatever the contact attached. Meta's CDN links expire, so a
 *  photo that no longer loads falls back to its label. */
function MessageBody({ message }: { message: InboxMessage }) {
  const [imageFailed, setImageFailed] = useState(false);
  const attachment = message.attachment;
  const url = attachment?.url;
  const showImage = Boolean(url && attachment && IMAGE_ATTACHMENTS.has(attachment.type) && !imageFailed);
  const showText = !showImage || message.text !== attachment?.label;
  return <>
    {showImage && <a className="ibx-attachment-image" href={url} target="_blank" rel="noopener noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element -- expiring Meta CDN URL, not a static asset */}
      <img src={url} alt={attachment!.label} loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
    </a>}
    {showText && <p>{message.text}</p>}
    {url && attachment && !showImage && ATTACHMENT_LINK_LABELS[attachment.type] && <a className="ibx-attachment-link" href={url} target="_blank" rel="noopener noreferrer">
      {ATTACHMENT_LINK_LABELS[attachment.type]} <ExternalLink size={12} aria-hidden="true" />
    </a>}
  </>;
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
  // Phones fold the owner / reminder / close controls behind one button so the
  // thread keeps its height; wider panes always show them.
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Screen readers hear only newly arrived inbound messages, not every
  // re-render of the thread (sends, status changes, loading earlier pages).
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<ConversationGroupKey>>(() => new Set());
  // "Reply" on a row opens the thread with the cursor already in the composer.
  const focusComposerRef = useRef(false);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const autoScrollRef = useRef(true);
  const contactsAbortRef = useRef<AbortController | null>(null);
  const conversationAbortRef = useRef<AbortController | null>(null);
  const activeContactIdRef = useRef<string | null>(null);
  // The open conversation the server no longer has (a live check got a 404):
  // live checks stop asking for its thread until a conversation is opened again.
  const goneContactIdRef = useRef<string | null>(null);

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
  /** One quiet check for new messages; says whether it worked, so the timer can back off. */
  const refreshLive = useEffectEvent(async (): Promise<"ok" | "failed" | "skipped"> => {
    const guard = liveGuardRef.current;
    if (guard.inFlight || liveBusy || document.visibilityState !== "visible") return "skipped";
    guard.inFlight = true;
    const requestFilters = filters;
    const requestKey = inboxCacheKey(filters);
    const openId = selectedId;
    const stillCurrent = () => guard.filtersKey === requestKey && !guard.busy;
    try {
      // A check that hangs gives up (and backs off) instead of holding every later check.
      const listResponse = await fetch(inboxUrl(requestFilters), { signal: AbortSignal.timeout(INBOX_LIVE_TIMEOUT_MS) });
      const listPayload = (await listResponse.json().catch(() => ({}))) as InboxPayload;
      // A failed list means the server is struggling: skip the thread too.
      if (!listResponse.ok || !listPayload.data) return "failed";
      if (stillCurrent()) {
        const page = listPayload.data;
        setContacts((existing) => mergeLiveContacts(existing, page.contacts));
        if (page.members) setMembers(page.members);
        writeInboxCache(requestFilters, { contacts: page.contacts, members: page.members ?? [], nextCursor: page.nextCursor });
      }
      if (openId && activeContactIdRef.current === openId && goneContactIdRef.current !== openId) {
        const threadResponse = await fetch(`/api/inbox/${openId}`, { signal: AbortSignal.timeout(INBOX_LIVE_TIMEOUT_MS) });
        // Only a struggling server slows the checks down (5xx, 429, or no
        // answer at all). Any other refusal is about this one conversation,
        // so the list keeps its normal pace.
        if (threadResponse.status >= 500 || threadResponse.status === 429) return "failed";
        if (!threadResponse.ok) {
          if (threadResponse.status === 404 && activeContactIdRef.current === openId) {
            goneContactIdRef.current = openId;
            setThreadError("This conversation is no longer available.");
          }
          return "ok";
        }
        const threadPayload = (await threadResponse.json().catch(() => ({}))) as ConversationPayload;
        if (!threadPayload.data) return "failed";
        if (activeContactIdRef.current === openId && !guard.busy) {
          const latest = threadPayload.data.messages;
          const known = new Set(messages.map((message) => message.id));
          const arrived = latest.filter((message) => message.direction === "inbound" && !known.has(message.id));
          setMessages((existing) => mergeLiveMessages(existing, latest));
          if (arrived.length > 0) {
            const from = contacts.find((contact) => contact.id === openId);
            const name = from ? displayName(from) : "this contact";
            setLiveAnnouncement(arrived.length === 1
              ? `New message from ${name}: ${arrived[0].text}`
              : `${arrived.length} new messages from ${name}. Latest: ${arrived[arrived.length - 1].text}`);
          }
          const openContact = listPayload.data.contacts.find((contact) => contact.id === openId);
          if (openContact?.unread) void patchContact(openId, { action: "mark_read" });
        }
      }
      return "ok";
    } catch {
      // Live refresh is opportunistic; the next tick (or a manual action) retries.
      return "failed";
    } finally {
      guard.inFlight = false;
    }
  });
  // Each check schedules the next one, so checks never pile up, and a run of
  // failures (a 502 during an outage) slows them down instead of keeping a
  // struggling server busy every 8 seconds.
  useEffect(() => {
    let timer: number | undefined;
    let dueAt = 0;
    let stopped = false;
    let failures = 0;
    // When the last check that actually asked the server started.
    let lastAttemptAt = 0;
    const schedule = (delay = liveRefreshDelay(failures)) => {
      window.clearTimeout(timer);
      dueAt = Date.now() + delay;
      timer = window.setTimeout(() => void tick(), delay);
    };
    const tick = async () => {
      const startedAt = Date.now();
      const outcome = await refreshLive();
      if (stopped) return;
      if (outcome !== "skipped") lastAttemptAt = startedAt;
      if (outcome === "failed") failures += 1;
      else if (outcome === "ok") failures = 0;
      schedule();
    };
    // Coming back to the tab checks at once. While checks are backing off it
    // still checks once, at once if the last attempt is 16 s old or more
    // (otherwise as soon as it is), so a tab that sat out an outage does not
    // wait up to two minutes for the next check.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const wait = failures > 0 ? Math.max(0, lastAttemptAt + INBOX_VISIBLE_RECHECK_MS - Date.now()) : 0;
      if (wait === 0) {
        window.clearTimeout(timer);
        void tick();
      } else if (dueAt - Date.now() > wait) {
        schedule(wait);
      }
    };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const selected = contacts.find((contact) => contact.id === selectedId) ?? null;
  const labels = useMemo(() => Array.from(new Set(contacts.flatMap((contact) => contact.tags))).sort(), [contacts]);
  const memberNames = useMemo(() => new Map(members.map((member) => [member.userId, member.email.split("@")[0]])), [members]);
  const groups = useMemo(() => groupMessages(messages), [messages]);
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  const openSpeaker = selectedId ? lastSpeaker(messages) : undefined;
  // The open thread knows who spoke last before the list does (a reply that
  // is still sending); every other row uses the server's lastMessageDirection.
  const conversationGroups = useMemo(
    () => groupConversations(contacts, (contactId) => (contactId === selectedId ? openSpeaker : undefined)),
    [contacts, openSpeaker, selectedId],
  );

  function toggleGroup(key: ConversationGroupKey) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function updateContact(contactId: string, update: (contact: InboxContact) => InboxContact) {
    setContacts((current) => current.map((contact) => contact.id === contactId ? update(contact) : contact));
    return mutateInboxCache(filters, contactId, update);
  }

  /** Carries who spoke last in the thread being left onto its row, until the next list refresh. */
  function rememberOpenSpeaker() {
    if (!selectedId || !openSpeaker) return;
    const contact = contacts.find((candidate) => candidate.id === selectedId);
    if (!contact || contact.lastMessageDirection === openSpeaker) return;
    updateContact(selectedId, (current) => ({ ...current, lastMessageDirection: openSpeaker }));
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
    rememberOpenSpeaker();
    conversationAbortRef.current?.abort();
    activeContactIdRef.current = null;
    goneContactIdRef.current = null;
    setSelectedId(null);
    setThreadError("");
    setLiveAnnouncement("");
  }

  /** Mirrors stage, owner and tag edits from the contact drawer into the list. */
  function applyContactUpdate(contactId: string, update: ContactUpdate) {
    const fields: Partial<InboxContact> = {};
    if (update.leadStatus) fields.leadStatus = update.leadStatus;
    if (update.tags) fields.tags = update.tags;
    // Present-but-undefined means the owner was cleared.
    if ("assigneeUserId" in update) fields.assigneeUserId = update.assigneeUserId;
    updateContact(contactId, (contact) => ({ ...contact, ...fields }));
  }

  async function openConversation(contact: InboxContact) {
    if (activeContactIdRef.current === contact.id && !threadError) return;
    if (activeContactIdRef.current !== contact.id) rememberOpenSpeaker();
    conversationAbortRef.current?.abort();
    const controller = new AbortController();
    conversationAbortRef.current = controller;
    activeContactIdRef.current = contact.id;
    goneContactIdRef.current = null;
    setSelectedId(contact.id);
    setOptionsOpen(false);
    setConversationLoading(true);
    setMessages([]);
    setMessageCursor(undefined);
    setThreadError("");
    setLiveAnnouncement("");
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

  function replyTo(contact: InboxContact) {
    if (activeContactIdRef.current === contact.id && !threadError) {
      composerRef.current?.focus();
      return;
    }
    focusComposerRef.current = true;
    void openConversation(contact);
  }

  // A link like /activity?contact=<id> (from the command palette) opens that
  // conversation once it appears in the loaded list. Read once, then forgotten,
  // so later list refreshes never steal the selection back.
  const linkedContactRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (linkedContactRef.current === undefined) {
      linkedContactRef.current = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("contact");
    }
    const linkedId = linkedContactRef.current;
    if (!linkedId) return;
    const linked = contacts.find((contact) => contact.id === linkedId);
    if (!linked) return;
    linkedContactRef.current = null;
    void openConversation(linked);
    // openConversation is recreated each render; the ref guard makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts]);

  // After "Reply", the composer for the newly opened thread takes focus.
  useEffect(() => {
    if (!focusComposerRef.current || !selectedId) return;
    focusComposerRef.current = false;
    composerRef.current?.focus();
  }, [selectedId]);

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
      if (!response.ok || !payload.data) throw new Error(toReadableApiError(payload.error, "Could not send message"));
      const sent = payload.data.message;
      if (activeContactIdRef.current === contactId) {
        setMessages((current) => current.map((message) => message.id === pending.id ? { ...sent, clientKey: pending.clientKey } : message));
      }
      const pausedUntil = payload.data.automationsPausedUntil;
      updateContact(contactId, (contact) => ({
        ...contact,
        preview: pending.text,
        lastMessageAt: sent.at,
        lastMessageDirection: "outbound",
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

  const toolbar = <InboxFilters value={filters} labels={labels} onChange={(next) => {
    closeConversation();
    const snapshot = readInboxCache(next).snapshot;
    setContacts(snapshot?.contacts ?? []); setMembers(snapshot?.members ?? []);
    setNextCursor(snapshot?.nextCursor); setFilterLoading(!snapshot); setFilters(next);
  }} />;

  if (!loaded) return <>{toolbar}<ActivityContentSkeleton /></>;

  const tooLong = draft.trim().length > MAX_MESSAGE_LENGTH;
  const inboxEmpty = contacts.length === 0 && !filtersActive && !filterLoading && !listError;

  function renderRow(contact: InboxContact, group: ConversationGroupKey) {
    const name = displayName(contact);
    const isSelected = selectedId === contact.id;
    const assignee = contact.assigneeUserId ? memberNames.get(contact.assigneeUserId) ?? "Assigned" : undefined;
    const reminderDue = isReminderDue(contact.reminderAt);
    // One action, only where it moves the conversation on.
    const action = group === "waiting" && contact.canMessage
      ? <button type="button" className="ibx-row-action" aria-label={`Reply to ${name}`} onClick={() => replyTo(contact)}>Reply</button>
      : group === "closed"
        ? <button type="button" className="ibx-row-action" aria-label={`Reopen ${name}`} onClick={() => void patchContact(contact.id, { action: "set_status", status: "OPEN" })}>Reopen</button>
        : null;
    return <li key={contact.id} className={`ibx-row-item ${isSelected ? "is-selected" : ""} ${contact.unread ? "is-unread" : ""} ${action ? "has-action" : ""}`}>
      <button type="button" className={`ibx-row ${isSelected ? "is-selected" : ""} ${contact.unread ? "is-unread" : ""}`} aria-current={isSelected ? "true" : undefined} aria-label={`Open conversation with ${name}`} onClick={() => void openConversation(contact)}>
        <span className="ibx-avatar"><SocialAvatar channel="instagram" name={name} src={contact.avatarUrl} />{contact.unread && <span className="ibx-unread-dot" aria-label="Unread" />}</span>
        <span className="ibx-row-copy">
          <span className="ibx-row-top">
            <strong>{name}</strong>
            {contact.favorite && <Star className="ibx-row-star" size={12} fill="currentColor" aria-label="Favourite" />}
            <time dateTime={contact.lastMessageAt} title={formatDateTime(contact.lastMessageAt)}>{formatListTime(contact.lastMessageAt)}</time>
          </span>
          <span className="ibx-row-preview">{contact.preview}</span>
          {(assignee || contact.reminderAt || !contact.canMessage || isAutomationPaused(contact)) && <span className="ibx-row-tags">
            {contact.reminderAt && <span className={`ibx-tag ${reminderDue ? "is-due" : ""}`}><BellRing size={12} aria-hidden="true" /><ReminderLabel value={contact.reminderAt} /></span>}
            {assignee && <span className="ibx-tag" title={`Owner: ${assignee}`}><UserRound size={12} aria-hidden="true" /><span className="ibx-tag-text">{assignee}</span></span>}
            {!contact.canMessage && contact.inboxStatus !== "CLOSED" && <span className="ibx-tag is-muted">Window closed</span>}
            {isAutomationPaused(contact) && <span className="ibx-tag"><PauseCircle size={12} aria-hidden="true" />Automations paused</span>}
          </span>}
        </span>
      </button>
      {action}
    </li>;
  }

  return <>{toolbar}<section className={`ibx-desk ${selected ? "has-thread" : ""}`} aria-label="Instagram inbox conversations">
    <aside className="ibx-list" aria-label="Contacts">
      <div className="ibx-list-body">
        {listError && contacts.length > 0 && <p className="ibx-banner is-error" role="alert"><AlertCircle size={16} aria-hidden="true" /><span>{listError}</span><button type="button" onClick={() => void loadContacts(true)}>Try again</button></p>}
        {listError && contacts.length === 0 && !filterLoading ? <div className="ibx-list-empty is-error" role="alert">
          <AlertCircle size={22} aria-hidden="true" />
          <p><strong>Your conversations didn’t load.</strong> {listError}</p>
          <button type="button" className="button button-secondary button-small" onClick={() => void loadContacts(true)}>Try again</button>
        </div> : filterLoading ? <div className="ibx-list-loading" aria-label="Loading conversations" aria-busy="true">
          {[0, 1, 2, 3, 4].map((index) => <div className="ibx-row-skeleton" key={index}><span className="skeleton-block skeleton-avatar" /><span className="skeleton-stack skeleton-row-copy"><span className="skeleton-block skeleton-word skeleton-row-title" /><span className="skeleton-block skeleton-word skeleton-row-meta" /></span></div>)}
        </div> : contacts.length === 0 ? <div className={`ibx-list-empty ${inboxEmpty ? "is-account-empty" : ""}`}>
          <Inbox size={22} aria-hidden="true" />
          {filtersActive ? <>
            <p>No conversations match these filters.</p>
            <button type="button" className="button button-secondary button-small" onClick={() => { setFilterLoading(!readInboxCache(DEFAULT_FILTERS).snapshot); setFilters(DEFAULT_FILTERS); }}>Clear filters</button>
          </> : <>
            <p>No messages yet. When someone DMs your Instagram account, they show up here.</p>
            <Link className="button button-secondary button-small" href="/automations">Set up an automation</Link>
          </>}
        </div> : <>
          {conversationGroups.map((group) => {
            const open = !collapsedGroups.has(group.key);
            const listId = `ibx-group-${group.key}`;
            return <div key={group.key} className={`ibx-group-block is-${group.key}`}>
              <h2 className="ibx-group-head">
                <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => toggleGroup(group.key)}>
                  <span>{group.label}</span>{" "}
                  <span className="ibx-group-count">{group.contacts.length}<span className="sr-only"> {group.contacts.length === 1 ? "conversation" : "conversations"}</span></span>
                  <ChevronDown className="ibx-group-chevron" size={16} aria-hidden="true" />
                </button>
              </h2>
              <Collapse open={open} id={listId}>{open && <ul className="ibx-rows" aria-label={group.label}>{group.contacts.map((contact) => renderRow(contact, group.key))}</ul>}</Collapse>
            </div>;
          })}
          {nextCursor && <button className="ibx-load-more" type="button" aria-label="Load more conversations" disabled={loadingMore} onClick={() => void loadContacts(false, nextCursor)}>{loadingMore ? "Loading…" : "Load more"}</button>}
        </>}
      </div>
    </aside>

    <div className="ibx-thread">
      {!selected ? <div className="ibx-thread-blank">
        <span className="ibx-blank-mark"><Inbox size={22} aria-hidden="true" /></span>
        {inboxEmpty ? <>
          <h2>No conversations yet</h2>
          <p>Replies your automations send, and every DM people send you, will appear here.</p>
          <Link className="button button-secondary button-small" href="/automations">Set up an automation</Link>
        </> : <>
          <h2>Pick a conversation</h2>
          <p>Choose someone from the list to read the thread and reply.</p>
        </>}
      </div> : <>
        <header className={`ibx-thread-head ${optionsOpen ? "is-options-open" : ""}`}>
          <button className="ibx-back" type="button" aria-label="Back to contacts" onClick={closeConversation}><ArrowLeft size={19} /></button>
          <button className="ibx-who" type="button" aria-label={`View details for ${displayName(selected)}`} onClick={() => setOpenContactId(selected.id)}>
            <SocialAvatar channel="instagram" name={displayName(selected)} src={selected.avatarUrl} />
            <span className="ibx-who-copy">
              <strong className="ibx-who-name">{displayName(selected)}</strong>
              <span className={`ibx-window ${selected.canMessage ? "is-open" : ""}`}>{selected.canMessage ? "Can reply now" : "Reply window closed"}</span>
            </span>
            <Info className="ibx-who-info" size={16} aria-hidden="true" />
          </button>
          <button className="ibx-options-toggle" type="button" aria-expanded={optionsOpen} aria-controls="ibx-conversation-actions" aria-label={optionsOpen ? "Hide conversation options" : "Conversation options"} onClick={() => setOptionsOpen((open) => !open)}><MoreHorizontal size={20} aria-hidden="true" /></button>
          <ConversationHeaderActions contact={selected} members={members} onOperation={(operation) => void patchContact(selected.id, operation)} />
        </header>

        <div className="ibx-messages" ref={messagesRef} aria-label={`Conversation with ${displayName(selected)}`}>
          {messageCursor && <button className="ibx-load-earlier" type="button" aria-label="Load earlier messages" disabled={olderLoading} onClick={() => void loadEarlier()}>{olderLoading ? "Loading…" : "Load earlier messages"}</button>}
          {conversationLoading ? <div className="ibx-thread-loading" aria-label="Loading conversation" aria-busy="true">
            <span className="skeleton-block ibx-bubble-skeleton" /><span className="skeleton-block ibx-bubble-skeleton is-out" /><span className="skeleton-block ibx-bubble-skeleton is-short" />
          </div> : messages.length === 0 ? <div className="ibx-thread-empty"><p>No messages with this contact yet.</p></div> : groups.map((group) => <Fragment key={group.key}>
            {group.day && <div className="ibx-day" role="separator"><span>{formatDayLabel(group.day)}</span></div>}
            <div className={`ibx-group is-${group.direction}`}>
              {group.messages.map((message, index) => <article className={`ibx-bubble is-${message.direction} ${message.status === "failed" ? "is-failed" : ""} ${message.status === "sending" ? "is-sending" : ""}`} key={message.clientKey ?? message.id}>
                <MessageBody message={message} />
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
    <p className="sr-only ibx-live-announcement" role="status" aria-atomic="true">{liveAnnouncement}</p>
    <Presence>{openContactId && <ContactDetailModal contactId={openContactId} onClose={() => setOpenContactId(null)} onUpdated={(update) => applyContactUpdate(openContactId, update)} />}</Presence>
  </section></>;
}
