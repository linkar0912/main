"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Boxes, Search, Users } from "lucide-react";

import type { AdminWorkspaceSummary, CursorPage } from "@/src/lib/admin/accounts-repository";
import { AdminPagination } from "./shared/admin-pagination";
import { StatusPill } from "./shared/status-pill";

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
    <main className="page-wrap admin-resource-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Linkar operator / accounts</p>
          <h1>Workspaces</h1>
          <p className="muted page-lede">Inspect every tenant, its plan, members, connections, and operational state.</p>
        </div>
        <span className="admin-count-badge"><Boxes size={16} /> {page.items.length} shown</span>
      </header>

      <form className="admin-filter-bar" role="search" onSubmit={submitSearch}>
        <label className="field admin-search-field">
          <span>Search workspaces</span>
          <span className="admin-input-icon"><Search size={17} aria-hidden /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, slug, or ID" /></span>
        </label>
        <button className="button button-secondary" type="submit">Search</button>
      </form>

      <section className="panel admin-table-panel" aria-label="Workspace accounts">
        {page.items.length === 0 ? (
          <div className="empty-state"><h2>No workspaces found</h2><p>{search ? "Try a different search term." : "Workspaces will be listed here once created."}</p></div>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead><tr><th>Workspace</th><th>Status</th><th>Assigned plan</th><th>Members</th><th>Automations</th><th><span className="sr-only">Open</span></th></tr></thead>
              <tbody>{page.items.map((workspace) => (
                <tr key={workspace.id}>
                  <td><strong>{workspace.name}</strong><small>{workspace.slug} · {workspace.id}</small></td>
                  <td><StatusPill status={workspace.status} /></td>
                  <td><strong>{workspace.planName}</strong><small>{workspace.planKey}</small></td>
                  <td><span className="admin-inline-count"><Users size={15} /> {workspace.memberCount}</span></td>
                  <td>{workspace.automationCount}</td>
                  <td><Link className="button button-ghost button-small" href={`/admin/workspaces/${workspace.id}`} aria-label={`Open ${workspace.name}`}>Open <ArrowRight size={15} /></Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <AdminPagination
        basePath="/admin/workspaces"
        params={search ? { search } : {}}
        cursor={cursor}
        history={history}
        nextCursor={page.nextCursor}
        label="Workspace pagination"
        summary="Results are ordered newest first."
      />
    </main>
  );
}
