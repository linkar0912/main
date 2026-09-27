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

export function ConversationHeaderActions({ contact, members, onOperation }: { contact: InboxContact; members: InboxMember[]; onOperation: (operation: InboxOperation) => void }) {
  const open = contact.inboxStatus === "OPEN";
  return <div className="ibx-actions" role="toolbar" aria-label="Conversation actions">
    <button className={`ibx-icon-button ${contact.favorite ? "is-on" : ""}`} type="button" aria-pressed={contact.favorite} aria-label={contact.favorite ? "Remove from favourites" : "Add to favourites"} title={contact.favorite ? "Starred" : "Star"} onClick={() => onOperation({ action: "set_favorite", favorite: !contact.favorite })}>
      <Star size={16} fill={contact.favorite ? "currentColor" : "none"} />
    </button>
    <button className="ibx-text-button" type="button" aria-label={open ? "Close conversation" : "Reopen conversation"} onClick={() => onOperation({ action: "set_status", status: open ? "CLOSED" : "OPEN" })}>
      {open ? <Archive size={15} aria-hidden="true" /> : <ArchiveRestore size={15} aria-hidden="true" />}
      <span>{open ? "Close" : "Reopen"}</span>
    </button>
    <label className="ibx-field ibx-assignee" title="Owner">
      <UserRound size={15} aria-hidden="true" />
      <select aria-label="Assign conversation" value={contact.assigneeUserId ?? ""} onChange={(event) => onOperation({ action: "set_assignment", assigneeUserId: event.target.value || null })}>
        <option value="">Unassigned</option>
        {members.map((member) => <option key={member.userId} value={member.userId}>{member.email}</option>)}
      </select>
    </label>
    <label className={`ibx-field ibx-reminder ${contact.reminderAt ? "is-set" : ""}`} title="Reminder">
      <BellRing size={15} aria-hidden="true" />
      <input aria-label="Conversation reminder" type="datetime-local" value={localReminder(contact.reminderAt)} onChange={(event) => onOperation({ action: "set_reminder", reminderAt: event.target.value ? new Date(event.target.value).toISOString() : null })} />
    </label>
  </div>;
}
