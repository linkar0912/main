"use client";

import { Check, Search, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { Collapse } from "@/src/components/ui/collapse";
import { slidingThumbRef } from "@/src/components/ui/use-sliding-thumb";
import type { InboxFiltersValue } from "./types";

const STATUS_OPTIONS: { value: InboxFiltersValue["status"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

/** How many of the tucked-away filters are narrowing the list right now. */
function advancedCount(value: InboxFiltersValue): number {
  return Number(value.assignment !== "all") + Number(Boolean(value.label)) + Number(value.reminder !== "all") + Number(value.sort !== "newest");
}

/** The toolbar between the channel tabs and the conversations: search, everyday filters, the rest on demand. */
export function InboxFilters({ value, labels, onChange }: { value: InboxFiltersValue; labels: string[]; onChange: (value: InboxFiltersValue) => void }) {
  const [expanded, setExpanded] = useState(false);
  const set = <K extends keyof InboxFiltersValue>(key: K, next: InboxFiltersValue[K]) => onChange({ ...value, [key]: next });
  const hidden = advancedCount(value);

  return <div className="ibx-toolbar" role="search" aria-label="Filter conversations">
    <div className="ibx-toolbar-row">
      <label className="ibx-search">
        <Search size={16} aria-hidden="true" />
        <input type="search" aria-label="Search contacts" placeholder="Search people or messages" value={value.query} onChange={(event) => set("query", event.target.value)} />
        {value.query && <button type="button" className="ibx-search-clear" aria-label="Clear search" onClick={() => set("query", "")}><X size={14} /></button>}
      </label>
      <div className="ibx-filter-row">
        <div ref={slidingThumbRef} className="segmented ibx-status" role="group" aria-label="Conversation status">
          {STATUS_OPTIONS.map((option) => <button key={option.value} type="button" className="segmented-option" aria-pressed={value.status === option.value} onClick={() => set("status", option.value)}>{option.label}</button>)}
        </div>
        <button type="button" className="ibx-chip" aria-pressed={value.unread} onClick={() => set("unread", !value.unread)}>{value.unread && <Check size={14} aria-hidden="true" />}Unread</button>
        <button type="button" className="ibx-chip" aria-pressed={value.favorite} onClick={() => set("favorite", !value.favorite)}>{value.favorite && <Check size={14} aria-hidden="true" />}Starred</button>
      </div>
      <button type="button" className="ibx-chip ibx-more" aria-expanded={expanded} aria-controls="ibx-advanced-filters" aria-label={expanded ? "Hide filters" : "More filters"} onClick={() => setExpanded((current) => !current)}>
        <SlidersHorizontal size={15} aria-hidden="true" />
        <span className="ibx-more-label">Filters</span>
        {hidden > 0 && <span className="ibx-more-count" aria-hidden="true">{hidden}</span>}
      </button>
    </div>

    <Collapse open={expanded}>{expanded && <div className="ibx-advanced" id="ibx-advanced-filters">
      <label><span>Sort</span><select aria-label="Sort conversations" value={value.sort} onChange={(event) => set("sort", event.target.value as InboxFiltersValue["sort"])}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="unread">Unread first</option></select></label>
      <label><span>Owner</span><select aria-label="Assignment" value={value.assignment} onChange={(event) => set("assignment", event.target.value as InboxFiltersValue["assignment"])}><option value="all">Anyone</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option></select></label>
      <label><span>Label</span><select aria-label="Label" value={value.label} onChange={(event) => set("label", event.target.value)}><option value="">Any label</option>{labels.map((label) => <option key={label} value={label}>{label}</option>)}</select></label>
      <label><span>Reminder</span><select aria-label="Reminder filter" value={value.reminder} onChange={(event) => set("reminder", event.target.value as InboxFiltersValue["reminder"])}><option value="all">Any time</option><option value="due">Due now</option><option value="scheduled">Scheduled</option></select></label>
    </div>}</Collapse>
  </div>;
}
