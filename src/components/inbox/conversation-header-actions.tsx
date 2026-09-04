import { Archive, Clock3, Star } from "lucide-react";
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
  return <div className="conversation-header-actions" role="toolbar" aria-label="Conversation actions">
    <button className="icon-button" type="button" aria-label={contact.favorite ? "Remove from favourites" : "Add to favourites"} onClick={() => onOperation({ action: "set_favorite", favorite: !contact.favorite })}><Star size={17} fill={contact.favorite ? "currentColor" : "none"} /></button>
    <button className="icon-button" type="button" aria-label={contact.inboxStatus === "OPEN" ? "Close conversation" : "Reopen conversation"} onClick={() => onOperation({ action: "set_status", status: contact.inboxStatus === "OPEN" ? "CLOSED" : "OPEN" })}><Archive size={17} /></button>
    <select className="conversation-assignee" aria-label="Assign conversation" value={contact.assigneeUserId ?? ""} onChange={(event) => onOperation({ action: "set_assignment", assigneeUserId: event.target.value || null })}><option value="">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.email}</option>)}</select>
    <label className="conversation-reminder"><Clock3 size={15} aria-hidden="true" /><span className="sr-only">Conversation reminder</span><input aria-label="Conversation reminder" type="datetime-local" value={localReminder(contact.reminderAt)} onChange={(event) => onOperation({ action: "set_reminder", reminderAt: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
  </div>;
}
