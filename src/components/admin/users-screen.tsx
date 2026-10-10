"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Search, UserPlus } from "lucide-react";

import { PageHeader } from "@/src/components/page-header";
import { RelativeTime } from "@/src/components/ui/relative-time";
import type { AdminUserSummary, CursorPage } from "@/src/lib/admin/accounts-repository";
import { AdminPagination } from "./shared/admin-pagination";
import { adminCommand, adminErrorMessage } from "./shared/admin-request";
import { REASON_LABEL } from "./shared/reason-dialog";
import { StatusPill } from "./shared/status-pill";

type Mode = "INVITE" | "CREATE";

function plural(count: number, word: string): string {
  return `${count.toLocaleString("en-IN")} ${word}${count === 1 ? "" : "s"}`;
}

export function UsersScreen({ page, search = "", cursor = null, history = [] }: { page: CursorPage<AdminUserSummary>; search?: string; cursor?: string | null; history?: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState(search);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<Mode>("INVITE");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function searchUsers(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("search", query.trim());
    router.push(`/admin/users${params.size ? `?${params}` : ""}`);
  }

  async function submitUser(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const address = email.trim();
      await adminCommand("/api/admin/users", { body: { email: address, mode, confirmed: mode === "CREATE" && confirmed }, reason, fallback: "user_create_failed" });
      setNotice(mode === "INVITE" ? `Invitation sent to ${address}.` : `Account created for ${address}.`);
      setEmail("");
      setReason("");
      setConfirmed(false);
      router.refresh();
    } catch (cause) {
      setError(adminErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-wrap admin-page">
      <PageHeader title="Users" description="Everyone who can sign in to Linkar, and the workspaces they belong to." />

      <section className="admin-card" aria-labelledby="add-user-title">
        <div className="admin-card-head">
          <div>
            <h2 id="add-user-title">Add a user</h2>
            <p>Send an invitation email, or create the account straight away.</p>
          </div>
        </div>
        <form className="admin-form is-full" onSubmit={submitUser}>
          <div className="admin-form-row">
            <label className="field">
              <span>Email address</span>
              <input type="email" required autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="field">
              <span>How to add them</span>
              <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
                <option value="INVITE">Send an invitation email</option>
                <option value="CREATE">Create the account now</option>
              </select>
            </label>
            <label className="field">
              <span>{REASON_LABEL}</span>
              <input required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
          </div>
          {mode === "CREATE" ? (
            <label className="admin-check">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Mark their email as already confirmed
            </label>
          ) : null}
          <div className="admin-actions">
            <button className="button button-primary" disabled={busy} type="submit"><UserPlus size={16} aria-hidden /> {mode === "INVITE" ? "Send invitation" : "Create user"}</button>
          </div>
          {error ? <div className="form-error admin-message" role="alert">{error}</div> : null}
          {notice ? <div className="form-success admin-message" role="status">{notice}</div> : null}
        </form>
      </section>

      <section className="admin-section" aria-label="User identities">
        <form className="admin-toolbar" role="search" onSubmit={searchUsers}>
          <label className="field is-grow">
            <span>Search users</span>
            <span className="admin-search">
              <Search size={17} aria-hidden />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Email address" />
            </span>
          </label>
          <button className="button button-secondary" type="submit">Search</button>
        </form>

        {page.searchLimited ? (
          <p className="admin-callout" role="status">This search looked at the first 5,000 accounts plus every workspace member. Type more of the email, or open the person from their workspace, to find the rest.</p>
        ) : null}

        <div className="admin-results"><span>{page.items.length === 0 ? "No users to show" : `Showing ${plural(page.items.length, "user")}`}</span></div>
        <div className="admin-card is-flush">
          {page.items.length === 0 ? (
            <div className="admin-empty">
              <p>{search ? "No one matches that email. Check the spelling or search part of the address." : "Invited and created users appear here."}</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table is-stackable">
                <thead>
                  <tr><th>User</th><th>Status</th><th className="is-numeric">Workspaces</th><th>Last signed in</th><th className="is-action"><span className="sr-only">Open</span></th></tr>
                </thead>
                <tbody>
                  {page.items.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <span className="cell-stack">
                          <Link href={`/admin/users/${user.id}`}>{user.email}</Link>
                          <span className="cell-meta">Joined <RelativeTime inline value={user.createdAt} /></span>
                        </span>
                      </td>
                      <td data-label="Status"><StatusPill status={user.status} /></td>
                      <td data-label="Workspaces" className="is-numeric">{user.workspaceCount}</td>
                      <td data-label="Last signed in"><RelativeTime value={user.lastSignInAt} fallback="Never" /></td>
                      <td className="is-action"><Link className="button button-ghost button-small" href={`/admin/users/${user.id}`} aria-label={`Open ${user.email}`}>Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <AdminPagination
          basePath="/admin/users"
          params={search ? { search } : {}}
          cursor={cursor}
          history={history}
          nextCursor={page.nextCursor}
          label="User pagination"
          summary={null}
        />
      </section>
    </main>
  );
}
