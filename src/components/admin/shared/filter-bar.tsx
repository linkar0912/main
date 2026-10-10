"use client";

import { FormEvent, useState } from "react";
import { Search } from "lucide-react";

import { statusLabel } from "./status-pill";

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
    <form className="admin-toolbar" onSubmit={submit}>
      <label className="field">
        <span>Workspace ID</span>
        <input value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} />
      </label>
      <label className="field">
        <span>Status</span>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Any</option>
          {statuses.map((item) => <option value={item} key={item}>{statusLabel(item)}</option>)}
        </select>
      </label>
      {showProvider ? (
        <label className="field">
          <span>Platform</span>
          <select value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="">Any</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
          </select>
        </label>
      ) : null}
      <label className="field is-grow">
        <span>{textLabel}</span>
        <span className="admin-search">
          <Search size={16} aria-hidden />
          <input value={text} placeholder={textPlaceholder} onChange={(event) => setText(event.target.value)} />
        </span>
      </label>
      <button className="button button-secondary" type="submit">Apply filters</button>
    </form>
  );
}
