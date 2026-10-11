"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Ban, KeyRound, Mail, RefreshCcw, ShieldOff, UserRoundCheck } from "lucide-react";

import { PageHeader } from "@/src/components/page-header";
import { IdChip } from "@/src/components/ui/id-chip";
import { RelativeTime } from "@/src/components/ui/relative-time";
import type { AdminUserDetail } from "@/src/lib/admin/accounts-repository";
import { AdminCommandError, adminCommand, adminErrorMessage } from "./shared/admin-request";
import { ReasonDialog } from "./shared/reason-dialog";
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

type Command = AccessAction | "RESET";

// What each command does, said once in the row and once in its dialog.
const commands: Record<Command, { area: string; title: string; description: string; confirm: string; danger?: boolean; icon: React.ReactNode }> = {
  SUSPEND: { area: "Linkar access", title: "Suspend Linkar access", description: "They can't open any workspace until you restore access.", confirm: "Suspend access", danger: true, icon: <Ban size={16} aria-hidden /> },
  RESTORE: { area: "Linkar access", title: "Restore Linkar access", description: "They can open their workspaces again.", confirm: "Restore access", icon: <RefreshCcw size={16} aria-hidden /> },
  REVOKE_LINKAR_SESSIONS: { area: "Sessions", title: "Sign out everywhere", description: "Ends every Linkar session on every device. They can sign in again.", confirm: "Sign out everywhere", icon: <KeyRound size={16} aria-hidden /> },
  BAN: { area: "Sign-in", title: "Block sign-in", description: "Stops them signing in at all. Linkar access is not changed.", confirm: "Block sign-in", danger: true, icon: <ShieldOff size={16} aria-hidden /> },
  UNBAN: { area: "Sign-in", title: "Allow sign-in", description: "Lets them sign in again. Linkar access is not changed.", confirm: "Allow sign-in", icon: <UserRoundCheck size={16} aria-hidden /> },
  RESET: { area: "Password", title: "Send password reset", description: "Emails them a link to choose a new password.", confirm: "Send password reset", icon: <Mail size={16} aria-hidden /> },
};

export function UserDetailScreen({ user }: { user: AdminUserDetail }) {
  const router = useRouter();
  const [command, setCommand] = useState<Command | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const memberships = user.workspaces ?? [];
  const active = user.status === "ACTIVE";
  // The Auth ban and Linkar access are separate controls with separate state.
  const banned = Boolean(user.authBannedUntil);
  const needsEmail = command === "RESET" || (command !== null && confirmedActions.includes(command));
  const rows: Command[] = [active ? "SUSPEND" : "RESTORE", "REVOKE_LINKAR_SESSIONS", banned ? "UNBAN" : "BAN", "RESET"];

  function open(next: Command) {
    setCommand(next);
    setConfirmation("");
    setError(null);
    setMessage(null);
  }

  async function run(reason: string) {
    if (!command) return;
    if (needsEmail && confirmation !== user.email) {
      setError(`Type ${user.email} exactly to continue.`);
      return;
    }
    const [path, body, success] = command === "RESET"
      ? ["reset", {}, `Password reset sent to ${user.email}.`] as const
      : ["access", { action: command }, accessMessages[command]] as const;
    setBusy(true);
    setError(null);
    try {
      await adminCommand(`/api/admin/users/${user.id}/${path}`, { body, reason, fallback: "admin_operation_failed" });
      setMessage(success);
      setCommand(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof AdminCommandError && cause.code === "auth_ban_active"
        ? "Allow sign-in again before restoring Linkar access."
        : adminErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-wrap admin-page is-narrow">
      <PageHeader
        back={<Link className="admin-back" href="/admin/users"><ArrowLeft size={16} aria-hidden /> All users</Link>}
        title={user.email}
        description={<>Joined <RelativeTime inline value={user.createdAt} />, member of {user.workspaceCount} {user.workspaceCount === 1 ? "workspace" : "workspaces"}</>}
        actions={<StatusPill status={user.status} />}
      />

      {message ? <div className="form-success admin-message" role="status">{message}</div> : null}

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

      <section className="admin-card" aria-labelledby="access-title">
        <div className="admin-card-head">
          <div>
            <h2 id="access-title">Access and recovery</h2>
            <p>Each action asks for a reason, and the ones that lock someone out ask you to type their email.</p>
          </div>
        </div>
        <ul className="admin-list admin-command-list">
          {rows.map((item) => {
            const restoreBlocked = item === "RESTORE" && banned;
            return (
              <li key={item}>
                <span className="admin-list-main">
                  <strong>{commands[item].area}</strong>
                  <span className="cell-meta">{restoreBlocked ? "Allow sign-in again before restoring Linkar access." : commands[item].description}</span>
                </span>
                <button className={`button button-secondary button-small ${commands[item].danger ? "is-danger" : ""}`.trim()} type="button" disabled={busy || restoreBlocked} onClick={() => open(item)}>
                  {commands[item].icon} {commands[item].title}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {command ? (
        <ReasonDialog
          title={`${commands[command].title} for ${user.email}`}
          intro={commands[command].description}
          danger={commands[command].danger}
          busy={busy}
          error={error}
          confirmLabel={commands[command].confirm}
          confirmDisabled={needsEmail && confirmation.trim().length === 0}
          onCancel={() => { setCommand(null); setError(null); }}
          onConfirm={(reason) => void run(reason)}
        >
          {needsEmail ? (
            <label className="field">
              <span>Type <code className="admin-phrase">{user.email}</code> to confirm</span>
              <input inputMode="email" autoCapitalize="none" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} />
            </label>
          ) : null}
        </ReasonDialog>
      ) : null}
    </main>
  );
}
