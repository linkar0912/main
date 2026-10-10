"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Search } from "lucide-react";

import { PageHeader } from "@/src/components/page-header";
import type { AdminWorkspaceSummary, CursorPage } from "@/src/lib/admin/accounts-repository";
import { AdminPagination } from "./shared/admin-pagination";
import { StatusPill } from "./shared/status-pill";

function plural(count: number, word: string): string {
  return `${count.toLocaleString("en-IN")} ${word}${count === 1 ? "" : "s"}`;
}

export function WorkspacesScreen({ page, search = "", cursor = null, history = [] }: { page: CursorPage<AdminWorkspaceSummary>; search?: string; cursor?: string | null; history?: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState(search);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("search", query.trim());
    router.push(`/admin/workspaces${params.size ? `?${params}` : ""}`);
  }

  return (
    <main className="page-wrap admin-page">
      <PageHeader title="Workspaces" description="Every customer workspace, its plan, people and connected accounts." />

      <form className="admin-toolbar" role="search" onSubmit={submitSearch}>
        <label className="field is-grow">
          <span>Search workspaces</span>
          <span className="admin-search"><Search size={17} aria-hidden /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, web address or ID" /></span>
        </label>
        <button className="button button-secondary" type="submit">Search</button>
      </form>

      <section className="admin-section" aria-label="Workspace accounts">
        <div className="admin-results">
          <span>{page.items.length === 0 ? "No workspaces to show" : `Showing ${plural(page.items.length, "workspace")}${search ? ` matching “${search}”` : ""}`}</span>
        </div>
        <div className="admin-card is-flush">
          {page.items.length === 0 ? (
            <div className="admin-empty">
              <p>{search ? "No workspace matches that search. Try a name, web address or ID." : "Workspaces appear here as soon as someone signs up."}</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table is-stackable">
                <thead><tr><th>Workspace</th><th>Status</th><th>Plan</th><th className="is-numeric">Members</th><th className="is-action"><span className="sr-only">Open</span></th></tr></thead>
                <tbody>{page.items.map((workspace) => (
                  <tr key={workspace.id}>
                    <td>
                      <span className="cell-stack">
                        <Link href={`/admin/workspaces/${workspace.id}`}>{workspace.name}</Link>
                        <span className="cell-meta"><span>{workspace.slug}</span><span>{plural(workspace.automationCount, "automation")}</span></span>
                      </span>
                    </td>
                    <td data-label="Status"><StatusPill status={workspace.status} /></td>
                    <td data-label="Plan">{workspace.planName}</td>
                    <td data-label="Members" className="is-numeric">{workspace.memberCount.toLocaleString("en-IN")}</td>
                    <td className="is-action"><Link className="button button-ghost button-small" href={`/admin/workspaces/${workspace.id}`} aria-label={`Open ${workspace.name}`}>Open</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
        <AdminPagination
          basePath="/admin/workspaces"
          params={search ? { search } : {}}
          cursor={cursor}
          history={history}
          nextCursor={page.nextCursor}
          label="Workspace pagination"
          summary="Newest workspaces first."
        />
      </section>
    </main>
  );
}
