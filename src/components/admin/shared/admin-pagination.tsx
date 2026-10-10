import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronsLeft } from "lucide-react";

// Keyset cursors only move forward, so the URL carries the cursors of the pages
// already visited. The stack is bounded; past it, Previous falls back to the
// first page rather than growing the URL without limit.
const MAX_HISTORY = 20;
const HISTORY_PARAM = "prev";

/** Reads the visited-page cursor stack from a search param value. */
export function parseAdminPageHistory(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  return value.split(",").filter((cursor) => cursor.length > 0 && cursor.length <= 2048).slice(-MAX_HISTORY);
}

function href(basePath: string, params: Record<string, string>, cursor: string | null, history: string[]): string {
  const search = new URLSearchParams(Object.entries(params).filter(([key, value]) => value && key !== "cursor" && key !== HISTORY_PARAM));
  if (cursor) search.set("cursor", cursor);
  if (cursor && history.length) search.set(HISTORY_PARAM, history.join(","));
  return search.size ? `${basePath}?${search}` : basePath;
}

export function AdminPagination({
  basePath,
  params,
  cursor,
  history,
  nextCursor,
  label,
  summary,
  nextLabel = "Next page",
}: {
  basePath: string;
  /** Active filters, kept on every link. */
  params: Record<string, string>;
  /** Cursor of the page being shown; null on the first page. */
  cursor: string | null;
  history: string[];
  nextCursor: string | null;
  label: string;
  summary: React.ReactNode;
  nextLabel?: string;
}) {
  const previousCursor = history.at(-1) ?? null;
  // Everything fits on one page: no paging controls, just the note if there is one.
  if (!cursor && !nextCursor) return summary ? <p className="admin-hint">{summary}</p> : null;
  return (
    <nav className="admin-pagination" aria-label={label}>
      <span>{summary}</span>
      <span className="admin-actions">
        {cursor ? (
          <>
            <Link className="button button-ghost button-small" href={href(basePath, params, null, [])}><ChevronsLeft size={16} /> First page</Link>
            <Link className="button button-secondary button-small" href={href(basePath, params, previousCursor, history.slice(0, -1))}><ArrowLeft size={16} /> Previous page</Link>
          </>
        ) : null}
        {nextCursor
          ? <Link className="button button-secondary button-small" href={href(basePath, params, nextCursor, cursor ? [...history, cursor].slice(-MAX_HISTORY) : [])}>{nextLabel} <ArrowRight size={16} /></Link>
          : <span>No more results</span>}
      </span>
    </nav>
  );
}
