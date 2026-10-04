"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowLeft, Ban, KeyRound, Mail, RefreshCcw, ShieldOff, UserRoundCheck } from "lucide-react";

import { formatAdminDate, formatAdminDateTime } from "@/src/components/admin/shared/date-format";
import type { AdminUserDetail } from "@/src/lib/admin/accounts-repository";
import { adminCommand, adminErrorMessage } from "./shared/admin-request";
import { StatusPill } from "./shared/status-pill";

type AccessAction = "SUSPEND" | "RESTORE" | "REVOKE_LINKAR_SESSIONS" | "BAN" | "UNBAN";

const accessMessages: Record<AccessAction, string> = {
  SUSPEND: "Linkar access suspended.",
  RESTORE: "Linkar access restored.",
  REVOKE_LINKAR_SESSIONS: "Existing sessions revoked.",
  BAN: "Auth login banned.",
  UNBAN: "Auth login unbanned and Linkar access restored.",
};
// Actions that lock the person out need the typed email as a second check.
const confirmedActions: readonly AccessAction[] = ["SUSPEND", "BAN"];

export function UserDetailScreen({ user }: { user: AdminUserDetail }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstAction = useRef<HTMLButtonElement>(null);
  const memberships = user.workspaces ?? [];
  const blocked = busy || reason.trim().length < 3;
  const active = user.status === "ACTIVE";

  async function run(path: string, body: unknown, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await adminCommand(`/api/admin/users/${user.id}/${path}`, { body, reason, fallback: "admin_operation_failed" });
      setMessage(success);
      setConfirmation("");
      router.refresh();
    } catch (cause) {
      setError(adminErrorMessage(cause));
    } finally {
      setBusy(false);
      firstAction.current?.focus();
    }
  }

  function confirmedByEmail(): boolean {
    if (confirmation === user.email) return true;
    setMessage(null);
    setError(`Type ${user.email} exactly to continue.`);
    return false;
  }

  function access(action: AccessAction) {
    if (confirmedActions.includes(action) && !confirmedByEmail()) return;
    void run("access", { action }, accessMessages[action]);
  }

  function reset() {
    if (!confirmedByEmail()) return;
    void run("reset", {}, `Password reset sent to ${user.email}.`);
  }

  return (
    <main className="page-wrap admin-resource-page">
      <Link className="admin-back-inline" href="/admin/users"><ArrowLeft size={16} /> All users</Link>
      <header className="page-header admin-detail-header">
        <div>
          <p className="eyebrow">User / {user.id}</p>
          <h1>{user.email}</h1>
          <p className="muted page-lede">Created {formatAdminDate(user.createdAt)} · {user.workspaceCount} workspace {user.workspaceCount === 1 ? "membership" : "memberships"}</p>
        </div>
        <StatusPill status={user.status} />
      </header>

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {message ? <div className="form-success" role="status">{message}</div> : null}

      <section className="admin-detail-grid">
        <article className="panel admin-summary-card">
          <p className="eyebrow">Authentication</p>
          <h2>Session state</h2>
          <dl>
            <div><dt>Last sign in</dt><dd>{user.lastSignInAt ? formatAdminDateTime(user.lastSignInAt) : "Never"}</dd></div>
            <div><dt>Sessions valid after</dt><dd>{user.sessionInvalidBefore ? formatAdminDateTime(user.sessionInvalidBefore) : "All current"}</dd></div>
          </dl>
        </article>
        <article className="panel admin-summary-card">
          <p className="eyebrow">Linkar lifecycle</p>
          <h2>{active ? "Access enabled" : "Access suspended"}</h2>
          {active
            ? <p className="muted">This identity can sign in to its workspaces.</p>
            : <p className="muted">{user.suspendedReason ?? "No suspension reason recorded."}{user.suspendedAt ? ` Suspended ${formatAdminDateTime(user.suspendedAt)}.` : ""}</p>}
        </article>
      </section>

      <section className="panel admin-detail-section">
        <div className="panel-heading">
          <div><p className="eyebrow">Tenant access</p><h2>Memberships</h2></div>
          <UserRoundCheck size={20} aria-hidden />
        </div>
        {memberships.length === 0 ? <p className="muted">This identity does not belong to any workspace.</p> : (
          <div className="admin-record-list">
            {memberships.map((workspace) => (
              <div className="admin-record-row" key={workspace.id}>
                <span>
                  <Link href={`/admin/workspaces/${workspace.id}`}><strong>{workspace.name}</strong></Link>
                  <small>{workspace.id} · {workspace.status.toLowerCase().replaceAll("_", " ")}</small>
                </span>
                <StatusPill status="idle" label={workspace.role.toLowerCase()} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel admin-detail-section admin-danger-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Audited identity controls</p><h2>Access and recovery</h2></div>
          <ShieldOff size={20} aria-hidden />
        </div>
        <div className="admin-command-form">
          <label className="field">
            <span>Operator reason</span>
            <textarea required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <label className="field">
            <span>Confirm sensitive actions by typing <code>{user.email}</code></span>
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <p className="admin-field-hint">Every action needs a reason. Suspending, banning, and password resets also need the email typed above.</p>
          <div className="admin-command-actions">
            <button ref={firstAction} className={`button ${active ? "button-danger" : "button-primary"}`} disabled={blocked} onClick={() => access(active ? "SUSPEND" : "RESTORE")} type="button">
              {active ? <><Ban size={16} /> Suspend</> : <><RefreshCcw size={16} /> Restore</>}
            </button>
            <button className="button button-secondary" disabled={blocked} onClick={() => access("REVOKE_LINKAR_SESSIONS")} type="button"><KeyRound size={16} /> Revoke sessions</button>
            <button className="button button-secondary" disabled={blocked} onClick={() => access("BAN")} type="button"><ShieldOff size={16} /> Ban Auth login</button>
            <button className="button button-ghost" disabled={blocked} onClick={() => access("UNBAN")} type="button"><UserRoundCheck size={16} /> Unban</button>
            <button className="button button-secondary" disabled={blocked} onClick={reset} type="button"><Mail size={16} /> Send password reset</button>
          </div>
        </div>
      </section>
    </main>
  );
}
