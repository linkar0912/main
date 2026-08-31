"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { ArrowLeft, Ban, KeyRound, Mail, RefreshCcw, ShieldOff, UserRoundCheck } from "lucide-react";

import type { AdminUserDetail } from "@/src/lib/admin/accounts-repository";

async function post(userId: string, path: string, body: unknown, reason: string) {
  const response = await fetch(`/api/admin/users/${userId}/${path}`, { method: "POST", headers: { "content-type": "application/json", "x-admin-reason": reason, "idempotency-key": `admin-${crypto.randomUUID()}` }, body: JSON.stringify(body) });
  const payload = await response.json() as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "admin_operation_failed");
}

export function UserDetailScreen({ user }: { user: AdminUserDetail }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstAction = useRef<HTMLButtonElement>(null);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setError(null); setMessage(null);
    try { await action(); setMessage(success); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "Operation failed"); }
    finally { setBusy(false); firstAction.current?.focus(); }
  }

  function access(action: "SUSPEND" | "RESTORE" | "REVOKE_LINKAR_SESSIONS" | "BAN" | "UNBAN") {
    if (["SUSPEND", "BAN"].includes(action) && confirmation !== user.email) { setError(`Type ${user.email} exactly to continue.`); return; }
    void run(() => post(user.id, "access", { action }, reason), `${action.toLowerCase().replaceAll("_", " ")} completed`);
  }

  function reset(event: FormEvent) {
    event.preventDefault();
    if (confirmation !== user.email) { setError(`Type ${user.email} exactly to continue.`); return; }
    void run(() => post(user.id, "reset", {}, reason), `Password reset sent to ${user.email}`);
  }

  return <main className="page-wrap admin-resource-page">
    <Link className="admin-back-inline" href="/admin/users"><ArrowLeft size={16} /> All users</Link>
    <header className="page-header admin-detail-header"><div><p className="eyebrow">User / {user.id}</p><h1>{user.email}</h1><p className="muted page-lede">Created {new Date(user.createdAt).toLocaleDateString()} · {user.workspaceCount} workspace memberships</p></div><span className={`status-pill is-${user.status.toLowerCase()}`}>{user.status.toLowerCase()}</span></header>
    {error ? <div className="form-error" role="alert">{error}</div> : null}{message ? <div className="form-success" role="status">{message}</div> : null}
    <section className="admin-detail-grid"><article className="panel admin-summary-card"><p className="eyebrow">Authentication</p><h2>Session state</h2><dl><div><dt>Last sign in</dt><dd>{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "Never"}</dd></div><div><dt>Sessions valid after</dt><dd>{user.sessionInvalidBefore ? new Date(user.sessionInvalidBefore).toLocaleString() : "All current"}</dd></div></dl></article><article className="panel admin-summary-card"><p className="eyebrow">Linkar lifecycle</p><h2>{user.status === "ACTIVE" ? "Access enabled" : "Access suspended"}</h2><p className="muted">{user.suspendedReason ?? "No suspension reason recorded."}</p></article></section>
    <section className="panel admin-detail-section"><div className="panel-heading"><div><p className="eyebrow">Tenant access</p><h2>Memberships</h2></div><UserRoundCheck size={20} /></div><div className="admin-record-list">{user.workspaces?.map((workspace) => <div className="admin-record-row" key={workspace.id}><span><strong>{workspace.name}</strong><small>{workspace.id} · {workspace.status.toLowerCase()}</small></span><span className="status-pill">{workspace.role.toLowerCase()}</span></div>) ?? <p className="muted">No memberships.</p>}</div></section>
    <section className="panel admin-detail-section admin-danger-panel"><div className="panel-heading"><div><p className="eyebrow">Audited identity controls</p><h2>Access and recovery</h2></div><ShieldOff size={20} /></div><div className="admin-command-form"><label className="field"><span>Operator reason</span><textarea required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label><label className="field"><span>Confirm sensitive actions by typing <code>{user.email}</code></span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label><div className="admin-command-actions"><button ref={firstAction} className="button button-danger" disabled={busy || reason.length < 3} onClick={() => access(user.status === "ACTIVE" ? "SUSPEND" : "RESTORE")} type="button">{user.status === "ACTIVE" ? <><Ban size={16} /> Suspend</> : <><RefreshCcw size={16} /> Restore</>}</button><button className="button button-secondary" disabled={busy || reason.length < 3} onClick={() => access("REVOKE_LINKAR_SESSIONS")} type="button"><KeyRound size={16} /> Revoke sessions</button><button className="button button-secondary" disabled={busy || reason.length < 3} onClick={() => access("BAN")} type="button"><ShieldOff size={16} /> Ban Auth login</button><button className="button button-ghost" disabled={busy || reason.length < 3} onClick={() => access("UNBAN")} type="button"><UserRoundCheck size={16} /> Unban</button></div><form onSubmit={reset}><button className="button button-secondary" disabled={busy || reason.length < 3} type="submit"><Mail size={16} /> Send password reset</button></form></div></section>
  </main>;
}
