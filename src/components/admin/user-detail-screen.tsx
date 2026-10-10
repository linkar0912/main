"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowLeft, Ban, KeyRound, Mail, RefreshCcw, ShieldOff, UserRoundCheck } from "lucide-react";

import { PageHeader } from "@/src/components/page-header";
import { IdChip } from "@/src/components/ui/id-chip";
import { RelativeTime } from "@/src/components/ui/relative-time";
import type { AdminUserDetail } from "@/src/lib/admin/accounts-repository";
import { AdminCommandError, adminCommand, adminErrorMessage } from "./shared/admin-request";
import { REASON_LABEL } from "./shared/reason-dialog";
import { StatusPill } from "./shared/status-pill";

type AccessAction = "SUSPEND" | "RESTORE" | "REVOKE_LINKAR_SESSIONS" | "BAN" | "UNBAN";

const accessMessages: Record<AccessAction, string> = {
  SUSPEND: "Linkar access suspended.",
  RESTORE: "Linkar access restored.",
  REVOKE_LINKAR_SESSIONS: "Signed out of every device.",
  BAN: "Sign-in blocked and every Linkar session ended.",
  UNBAN: "Sign-in allowed again. Linkar access is unchanged.",
};
// Actions that lock the person out need the typed email as a second check.
const confirmedActions: readonly AccessAction[] = ["SUSPEND", "BAN"];

function roleLabel(role: string): string {
  const text = role.toLowerCase().replaceAll("_", " ");
  return `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;
}

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
  // The Auth ban and Linkar access are separate controls with separate state.
  const banned = Boolean(user.authBannedUntil);

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
      setError(cause instanceof AdminCommandError && cause.code === "auth_ban_active"
        ? "Allow sign-in again before restoring Linkar access."
        : adminErrorMessage(cause));
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
    <main className="page-wrap admin-page is-narrow">
      <PageHeader
        back={<Link className="admin-back" href="/admin/users"><ArrowLeft size={16} aria-hidden /> All users</Link>}
        title={user.email}
        description={<>Joined <RelativeTime inline value={user.createdAt} />, member of {user.workspaceCount} {user.workspaceCount === 1 ? "workspace" : "workspaces"}</>}
        actions={<StatusPill status={user.status} />}
      />

      <section className="admin-card" aria-labelledby="sign-in-title">
        <div className="admin-card-head">
          <h2 id="sign-in-title">Sign-in</h2>
          <IdChip id={user.id} prefix="User ID" />
        </div>
        <dl className="admin-kv">
          <div><dt>Last signed in</dt><dd><RelativeTime value={user.lastSignInAt} fallback="Never" /></dd></div>
          <div><dt>Signed out everywhere</dt><dd><RelativeTime value={user.sessionInvalidBefore} fallback="Not yet" /></dd></div>
          <div><dt>Can sign in</dt><dd>{banned ? <>Blocked until <RelativeTime inline value={user.authBannedUntil} /></> : "Yes"}</dd></div>
          <div>
            <dt>Linkar access</dt>
            <dd>{active ? "Allowed" : <>Suspended{user.suspendedAt ? <> <RelativeTime inline value={user.suspendedAt} /></> : null}</>}</dd>
          </div>
        </dl>
        {!active ? <p className="admin-hint">{user.suspendedReason ? `Suspended because: ${user.suspendedReason}` : "No suspension reason was recorded."}</p> : null}
      </section>

      <section className="admin-card" aria-labelledby="memberships-title">
        <div className="admin-card-head"><h2 id="memberships-title">Workspaces</h2></div>
        {memberships.length === 0 ? <p className="admin-hint">This identity does not belong to any workspace.</p> : (
          <ul className="admin-list">
            {memberships.map((workspace) => (
              <li key={workspace.id}>
                <span className="admin-list-main">
                  <Link href={`/admin/workspaces/${workspace.id}`}>{workspace.name}</Link>
                  <span className="cell-meta">{roleLabel(workspace.role)}</span>
                </span>
                <StatusPill status={workspace.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-card is-danger" aria-labelledby="access-title">
        <div className="admin-card-head">
          <div>
            <h2 id="access-title">Access and recovery</h2>
            <p>Suspend and restore control Linkar access. Blocking sign-in stops them logging in at all and does not change Linkar access.</p>
          </div>
        </div>
        <div className="admin-form">
          <label className="field">
            <span>{REASON_LABEL}</span>
            <textarea required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <label className="field">
            <span>Type <code className="admin-phrase">{user.email}</code> to confirm suspending, blocking or a password reset</span>
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          {banned && !active ? <p className="admin-hint">Allow sign-in again before restoring Linkar access.</p> : null}
          <div className="admin-actions">
            <button ref={firstAction} className={`button ${active ? "button-danger" : "button-primary"}`} disabled={blocked || (!active && banned)} onClick={() => access(active ? "SUSPEND" : "RESTORE")} type="button">
              {active ? <><Ban size={16} aria-hidden /> Suspend Linkar access</> : <><RefreshCcw size={16} aria-hidden /> Restore Linkar access</>}
            </button>
            <button className="button button-secondary" disabled={blocked} onClick={() => access("REVOKE_LINKAR_SESSIONS")} type="button"><KeyRound size={16} aria-hidden /> Sign out everywhere</button>
            {banned
              ? <button className="button button-secondary" disabled={blocked} onClick={() => access("UNBAN")} type="button"><UserRoundCheck size={16} aria-hidden /> Allow sign-in</button>
              : <button className="button button-secondary" disabled={blocked} onClick={() => access("BAN")} type="button"><ShieldOff size={16} aria-hidden /> Block sign-in</button>}
            <button className="button button-secondary" disabled={blocked} onClick={reset} type="button"><Mail size={16} aria-hidden /> Send password reset</button>
          </div>
          {error ? <div className="form-error admin-message" role="alert">{error}</div> : null}
          {message ? <div className="form-success admin-message" role="status">{message}</div> : null}
        </div>
      </section>
    </main>
  );
}
