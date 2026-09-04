"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Inbox, Info, Search, Send } from "lucide-react";
import { ContactDetailModal } from "./contact-detail-modal";
import { ActivityContentSkeleton } from "./skeleton";
import { SocialAvatar } from "./social-avatar";

type InboxContact = {
  id: string;
  username?: string;
  avatarUrl: string;
  preview: string;
  lastMessageAt: string;
  canMessage: boolean;
  leadStatus: "NEW" | "ENGAGED" | "QUALIFIED" | "CUSTOMER";
  tags: string[];
};

type InboxMessage = {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  at: string;
  status: "received" | "sending" | "sent" | "failed" | "unknown";
  error?: string;
};

function displayName(contact: InboxContact): string {
  return contact.username ? `@${contact.username.replace(/^@+/, "")}` : `Instagram contact ·${contact.id.slice(-5)}`;
}

function formatListTime(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMessageTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Contact-first Instagram conversation desk with persistent manual replies. */
export function ActivityFeed() {
  const [contacts, setContacts] = useState<InboxContact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/inbox")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { data?: { contacts: InboxContact[] }; error?: string };
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load inbox");
        if (active) setContacts(payload.data.contacts);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load inbox");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => { active = false; };
  }, []);

  const visibleContacts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((contact) => `${displayName(contact)} ${contact.preview} ${contact.tags.join(" ")}`.toLowerCase().includes(needle));
  }, [contacts, query]);
  const selected = contacts.find((contact) => contact.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    fetch(`/api/inbox/${selectedId}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { data?: { messages: InboxMessage[] }; error?: string };
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load conversation");
        if (active) setMessages(payload.data.messages);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load conversation");
      })
      .finally(() => {
        if (active) setConversationLoading(false);
      });
    return () => { active = false; };
  }, [selectedId]);

  function openConversation(contactId: string) {
    setConversationLoading(true);
    setError("");
    setMessages([]);
    setSelectedId(contactId);
  }

  useEffect(() => {
    if (typeof messageEndRef.current?.scrollIntoView === "function") {
      messageEndRef.current.scrollIntoView({ block: "nearest" });
    }
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
        ? { ...contact, preview: text, lastMessageAt: payload.data!.message.at }
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

  return (
    <section className={`conversation-desk ${selected ? "has-conversation" : ""}`} aria-label="Inbox conversations">
      <aside className="conversation-roster" aria-label="Contacts">
        <div className="conversation-roster-head">
          <div><h2>All conversations</h2><span>{contacts.length} contact{contacts.length === 1 ? "" : "s"}</span></div>
          <label className="conversation-search">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Search contacts</span>
            <input type="search" aria-label="Search contacts" placeholder="Search people or messages" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>

        {visibleContacts.length === 0 ? (
          <div className="conversation-roster-empty">
            <Inbox size={21} />
            <p>{contacts.length ? "No contacts match this search." : "Contacts will appear here after they interact with your account."}</p>
          </div>
        ) : (
          <ul className="conversation-contact-list">
            {visibleContacts.map((contact) => (
              <li key={contact.id}>
                <button type="button" className={selectedId === contact.id ? "is-selected" : ""} aria-label={`Open conversation with ${displayName(contact)}`} onClick={() => openConversation(contact.id)}>
                  <SocialAvatar channel="instagram" name={displayName(contact)} src={contact.avatarUrl} />
                  <span className="conversation-contact-copy">
                    <span className="conversation-contact-topline"><strong>{displayName(contact)}</strong><time dateTime={contact.lastMessageAt}>{formatListTime(contact.lastMessageAt)}</time></span>
                    <span className="conversation-preview">{contact.preview}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="conversation-panel">
        {!selected ? (
          <div className="conversation-blank"><span><Inbox size={24} /></span><h2>Your conversations live here</h2><p>Select any contact to read the history and reply.</p></div>
        ) : (
          <>
            <header className="conversation-header">
              <button className="conversation-back" type="button" aria-label="Back to contacts" onClick={() => setSelectedId(null)}><ArrowLeft size={19} /></button>
              <SocialAvatar channel="instagram" name={displayName(selected)} src={selected.avatarUrl} />
              <div><h2>{displayName(selected)}</h2><p>{selected.canMessage ? "Instagram · Available to reply" : "Instagram · Reply window closed"}</p></div>
              <button className="icon-button" type="button" aria-label={`View details for ${displayName(selected)}`} onClick={() => setOpenContactId(selected.id)}><Info size={18} /></button>
            </header>

            <div className="conversation-messages" aria-label={`Conversation with ${displayName(selected)}`} aria-live="polite">
              {conversationLoading ? (
                <div className="conversation-loading">Loading conversation…</div>
              ) : messages.length === 0 ? (
                <div className="conversation-empty"><p>No messages with this contact yet.</p></div>
              ) : messages.map((message) => (
                <article className={`conversation-message is-${message.direction}`} key={message.id}>
                  <p>{message.text}</p>
                  <footer><time dateTime={message.at}>{formatMessageTime(message.at)}</time>{message.direction === "outbound" && <span>{message.status}</span>}</footer>
                  {message.error && <small>{message.error}</small>}
                </article>
              ))}
              <div ref={messageEndRef} />
            </div>

            <div className="conversation-compose">
              {!selected.canMessage && <p className="conversation-window-note">The 24-hour Instagram reply window has closed. This contact can message you to reopen it.</p>}
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="conversation-compose-row">
                <textarea
                  aria-label={`Message ${displayName(selected)}`}
                  placeholder={selected.canMessage ? "Write a reply…" : "Waiting for this contact to message again"}
                  rows={2}
                  maxLength={1000}
                  value={draft}
                  disabled={!selected.canMessage || sending}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
                  }}
                />
                <button type="button" aria-label="Send message" onClick={() => void sendMessage()} disabled={!selected.canMessage || !draft.trim() || sending}>
                  <Send size={18} /><span>{sending ? "Sending" : "Send"}</span>
                </button>
              </div>
              <small>{draft.length}/1000 · Enter to send, Shift+Enter for a new line</small>
            </div>
          </>
        )}
      </div>

      {openContactId && <ContactDetailModal contactId={openContactId} onClose={() => setOpenContactId(null)} />}
    </section>
  );
}
