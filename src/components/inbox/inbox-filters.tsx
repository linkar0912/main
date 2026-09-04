import { Search } from "lucide-react";
import type { InboxFiltersValue } from "./types";

export function InboxFilters({ value, labels, onChange }: { value: InboxFiltersValue; labels: string[]; onChange: (value: InboxFiltersValue) => void }) {
  const set = <K extends keyof InboxFiltersValue>(key: K, next: InboxFiltersValue[K]) => onChange({ ...value, [key]: next });
  return <div className="conversation-filter-stack">
    <label className="conversation-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search contacts</span><input type="search" aria-label="Search contacts" placeholder="Search people or messages" value={value.query} onChange={(event) => set("query", event.target.value)} /></label>
    <div className="conversation-filter-grid">
      <select aria-label="Conversation status" value={value.status} onChange={(event) => set("status", event.target.value as InboxFiltersValue["status"])}><option value="all">All chats</option><option value="open">Open</option><option value="closed">Closed</option></select>
      <select aria-label="Assignment" value={value.assignment} onChange={(event) => set("assignment", event.target.value as InboxFiltersValue["assignment"])}><option value="all">All assignees</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option></select>
      <select aria-label="Label" value={value.label} onChange={(event) => set("label", event.target.value)}><option value="">All labels</option>{labels.map((label) => <option key={label} value={label}>{label}</option>)}</select>
      <select aria-label="Reminder filter" value={value.reminder} onChange={(event) => set("reminder", event.target.value as InboxFiltersValue["reminder"])}><option value="all">All reminders</option><option value="due">Due now</option><option value="scheduled">Scheduled</option></select>
      <select aria-label="Sort conversations" value={value.sort} onChange={(event) => set("sort", event.target.value as InboxFiltersValue["sort"])}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="unread">Unread first</option></select>
    </div>
    <div className="conversation-filter-toggles"><label><input type="checkbox" checked={value.unread} onChange={(event) => set("unread", event.target.checked)} /> Unread only</label><label><input type="checkbox" checked={value.favorite} onChange={(event) => set("favorite", event.target.checked)} /> Favourites</label></div>
  </div>;
}
