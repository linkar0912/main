"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Search, UserPlus, Users } from "lucide-react";

import type { AdminUserSummary, CursorPage } from "@/src/lib/admin/accounts-repository";

async function createUser(email: string, mode: "INVITE" | "CREATE", confirmed: boolean, reason: string) {
  const response = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json", "x-admin-reason": reason, "idempotency-key": `admin-${crypto.randomUUID()}` }, body: JSON.stringify({ email, mode, confirmed }) });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "user_create_failed");
}

export function UsersScreen({ page, search = "" }: { page: CursorPage<AdminUserSummary>; search?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(search);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"INVITE" | "CREATE">("INVITE");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function searchUsers(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("search", query.trim());
    router.push(`/admin/users${params.size ? `?${params}` : ""}`);
  }

  async function submitUser(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { await createUser(email, mode, confirmed, reason); setEmail(""); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "Operation failed"); }
    finally { setBusy(false); }
  }

  return <main className="page-wrap admin-resource-page">
    <header className="page-header"><div><p className="eyebrow">Linkar operator / identities</p><h1>Users</h1><p className="muted page-lede">Manage Supabase identities and Linkar access without exposing credentials.</p></div><span className="admin-count-badge"><Users size={16} /> {page.items.length} shown</span></header>
    {error ? <div className="form-error" role="alert">{error}</div> : null}
    <section className="panel admin-create-panel">
      <div className="panel-heading"><div><p className="eyebrow">Provisioning</p><h2>Invite or create user</h2></div><UserPlus size={20} /></div>
      <form className="admin-create-form" onSubmit={submitUser}>
        <label className="field"><span>Email</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="field"><span>Mode</span><select value={mode} onChange={(event) => setMode(event.target.value as "INVITE" | "CREATE")}><option value="INVITE">Send invitation</option><option value="CREATE">Create identity</option></select></label>
        <label className="field"><span>Operator reason</span><input required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        {mode === "CREATE" ? <label className="admin-check-field"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Mark email confirmed</label> : null}
        <button className="button button-primary" disabled={busy} type="submit">{mode === "INVITE" ? "Send invitation" : "Create user"}</button>
      </form>
    </section>
    <form className="admin-filter-bar" role="search" onSubmit={searchUsers}><label className="field admin-search-field"><span>Search users</span><span className="admin-input-icon"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Email address" /></span></label><button className="button button-secondary" type="submit">Search</button></form>
    <section className="panel admin-table-panel" aria-label="User identities">{page.items.length === 0 ? <div className="empty-state"><h2>No users found</h2><p>Try a different email search.</p></div> : <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>User</th><th>Status</th><th>Workspaces</th><th>Last sign in</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{page.items.map((user) => <tr key={user.id}><td><strong>{user.email}</strong><small>{user.id}</small></td><td><span className={`status-pill is-${user.status.toLowerCase()}`}>{user.status.toLowerCase()}</span></td><td>{user.workspaceCount}</td><td>{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "Never"}</td><td><Link className="button button-ghost button-small" href={`/admin/users/${user.id}`} aria-label={`Open ${user.email}`}>Open <ArrowRight size={15} /></Link></td></tr>)}</tbody></table></div>}</section>
    <nav className="admin-pagination" aria-label="User pagination"><span className="muted">Supabase identities joined to Linkar memberships.</span>{page.nextCursor ? <Link className="button button-secondary" href={`/admin/users?${new URLSearchParams({ ...(search ? { search } : {}), cursor: page.nextCursor })}`}>Next page <ArrowRight size={16} /></Link> : <span className="muted">End of results</span>}</nav>
  </main>;
}
