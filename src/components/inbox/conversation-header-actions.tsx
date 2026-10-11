import { useState } from "react";
import { Archive, ArchiveRestore, BellRing, Star, UserRound } from "lucide-react";
import type { InboxContact, InboxMember } from "./types";

export type InboxOperation =
  | { action: "set_status"; status: "OPEN" | "CLOSED" }
  | { action: "set_favorite"; favorite: boolean }
  | { action: "set_reminder"; reminderAt: string | null }
  | { action: "set_assignment"; assigneeUserId: string | null };

function localReminder(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/**
 * datetime-local fires a change for every segment typed (day, month, hour...),
 * so the reminder is held locally and saved once: on blur or Enter. Saving on
 * each change sent a burst of PATCHes with half-edited times.
 */
function ReminderField({ value, onCommit }: { value?: string; onCommit: (reminderAt: string | null) => void }) {
  const saved = localReminder(value);
  const [draft, setDraft] = useState(saved);
  const [lastSaved, setLastSaved] = useState(saved);
  // A refresh or another teammate changed the reminder: show theirs.
  if (lastSaved !== saved) {
    setLastSaved(saved);
    setDraft(saved);
  }

  function commit() {
    if (draft === saved) return;
    const date = draft ? new Date(draft) : null;
    if (date && Number.isNaN(date.getTime())) return;
    onCommit(date ? date.toISOString() : null);
  }

  return <>
    {/* A native date-time box shows "dd/mm/yyyy, --:--" when empty; say what it is for instead. */}
    {!draft && <span className="ibx-reminder-placeholder" aria-hidden="true">Set a reminder</span>}
    <input
    aria-label="Conversation reminder"
    type="datetime-local"
    value={draft}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); commit(); }
      if (event.key === "Escape") setDraft(saved);
    }}
  />
  </>;
}

export function ConversationHeaderActions({ contact, members, onOperation }: { contact: InboxContact; members: InboxMember[]; onOperation: (operation: InboxOperation) => void }) {
  const open = contact.inboxStatus === "OPEN";
  return <div className="ibx-actions" id="ibx-conversation-actions" role="toolbar" aria-label="Conversation actions">
    <button className={`ibx-icon-button ${contact.favorite ? "is-on" : ""}`} type="button" aria-pressed={contact.favorite} aria-label={contact.favorite ? "Remove from favourites" : "Add to favourites"} title={contact.favorite ? "Starred" : "Star"} onClick={() => onOperation({ action: "set_favorite", favorite: !contact.favorite })}>
      <Star size={16} fill={contact.favorite ? "currentColor" : "none"} />
    </button>
    <button className="ibx-text-button" type="button" aria-label={open ? "Close conversation" : "Reopen conversation"} onClick={() => onOperation({ action: "set_status", status: open ? "CLOSED" : "OPEN" })}>
      {open ? <Archive size={15} aria-hidden="true" /> : <ArchiveRestore size={15} aria-hidden="true" />}
      <span>{open ? "Close" : "Reopen"}</span>
    </button>
    <label className="ibx-field ibx-assignee" title={contact.assigneeUserId ? `Owner: ${members.find((member) => member.userId === contact.assigneeUserId)?.email ?? "former member"}` : "Owner"}>
      <UserRound size={15} aria-hidden="true" />
      <select aria-label="Assign conversation" value={contact.assigneeUserId ?? ""} onChange={(event) => onOperation({ action: "set_assignment", assigneeUserId: event.target.value || null })}>
        <option value="">Unassigned</option>
        {members.map((member) => <option key={member.userId} value={member.userId}>{member.email}</option>)}
      </select>
    </label>
    <label className={`ibx-field ibx-reminder ${contact.reminderAt ? "is-set" : ""}`} title="Reminder">
      <BellRing size={15} aria-hidden="true" />
      {/* Keyed by contact so a half-typed draft never carries to the next conversation. */}
      <ReminderField key={contact.id} value={contact.reminderAt} onCommit={(reminderAt) => onOperation({ action: "set_reminder", reminderAt })} />
    </label>
  </div>;
}
