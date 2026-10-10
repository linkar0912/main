"use client";

import { FormEvent, useState } from "react";
import { Search } from "lucide-react";

import { humanizeAdminCode } from "./admin-request";

type Filters = { workspaceId?: string; status?: string; text?: string; provider?: string };

export function FilterBar({
  initial,
  statuses,
  showProvider = true,
  textLabel = "Text",
  textPlaceholder,
  onApply,
}: {
  initial: Filters;
  /** States valid for the selected resource kind. */
  statuses: readonly string[];
  showProvider?: boolean;
  /** What the free-text filter matches for this resource kind. */
  textLabel?: string;
  textPlaceholder?: string;
  onApply: (filters: Record<string, string>) => void;
}) {
  const [workspaceId, setWorkspaceId] = useState(initial.workspaceId ?? "");
  // A status carried over from another resource kind is not offered, so it is dropped.
  const [status, setStatus] = useState(initial.status && statuses.includes(initial.status) ? initial.status : "");
  const [text, setText] = useState(initial.text ?? "");
  const [provider, setProvider] = useState(showProvider ? initial.provider ?? "" : "");

  function submit(event: FormEvent) {
    event.preventDefault();
    onApply({ workspaceId: workspaceId.trim(), status, text: text.trim(), provider });
  }

  return (
    <form className="admin-filter-bar admin-operations-filter" onSubmit={submit}>
      <label className="field">
        <span>Workspace ID</span>
        <input value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} />
      </label>
      <label className="field">
        <span>Status</span>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All</option>
          {statuses.map((item) => <option value={item} key={item}>{humanizeAdminCode(item.toLowerCase())}</option>)}
        </select>
      </label>
      {showProvider ? (
        <label className="field">
          <span>Provider</span>
          <select value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="">All</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
          </select>
        </label>
      ) : null}
      <label className="field admin-search-field">
        <span>{textLabel}</span>
        <span className="admin-input-icon">
          <Search size={16} aria-hidden />
          <input value={text} placeholder={textPlaceholder} onChange={(event) => setText(event.target.value)} />
        </span>
      </label>
      <button className="button button-secondary" type="submit">Apply filters</button>
    </form>
  );
}
