import Link from "next/link";

import { IdChip } from "@/src/components/ui/id-chip";
import { RelativeTime } from "@/src/components/ui/relative-time";
import type { AdminOperationItem } from "@/src/lib/admin/operations/types";
import { humanizeAdminCode } from "./admin-request";
import { StatusPill } from "./status-pill";

const providerNames = { instagram: "Instagram", facebook: "Facebook" } as const;

export function CursorTable({ items, onOpen }: { items: AdminOperationItem[]; onOpen: (item: AdminOperationItem, button: HTMLButtonElement) => void }) {
  if (!items.length) {
    return (
      <div className="admin-empty">
        <p>Nothing matches these filters. Try another record type or clear the filters.</p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="data-table is-stackable">
        <thead>
          <tr>
            <th>Record</th>
            <th>Workspace</th>
            <th>Status</th>
            <th>Updated</th>
            <th className="is-action"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <span className="cell-stack">
                  <strong>{item.title}</strong>
                  <span className="cell-meta">
                    {item.provider ? <span>{providerNames[item.provider]}</span> : null}
                    <IdChip id={item.id} />
                  </span>
                </span>
              </td>
              <td data-label="Workspace"><Link href={`/admin/workspaces/${item.workspace.id}`}>{item.workspace.name}</Link></td>
              <td data-label="Status">
                <span className="cell-stack">
                  <StatusPill status={item.status} />
                  {item.safeErrorCode ? <span className="cell-meta">{humanizeAdminCode(item.safeErrorCode.toLowerCase())}</span> : null}
                </span>
              </td>
              <td data-label="Updated"><RelativeTime value={item.updatedAt} /></td>
              <td className="is-action">
                <button className="button button-ghost button-small" type="button" aria-label={`Open ${item.title}`} onClick={(event) => onOpen(item, event.currentTarget)}>
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
