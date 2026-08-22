"use client";

import Link from "next/link";
import { AlertTriangle, Camera, Check, Clock, ExternalLink, LockKeyhole, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "./app-shell";
import { StatusBadge } from "./status-badge";
import type { ConnectionStatus } from "@/src/lib/repository";
import { PRODUCT_NAME } from "@/src/lib/branding";

type Connection = { id: string; igUserId: string; username: string; status: ConnectionStatus; connectedAt: string };
type ConnectionHealth = {
  id: string;
  username: string;
  status: ConnectionStatus;
  requiredFields: string[];
  subscribedFields: string[];
  missingFields: string[];
  checkError?: string;
};
type TeamMember = { email: string; role: string };
type TeamInvitation = { id: string; email: string; role: string; expiresAt: string };
type TeamOverview = { members: TeamMember[]; invitations: TeamInvitation[] };

const WEBHOOK_FIELD_LABELS: Record<string, string> = {
  comments: "Comments",
  messages: "Messages",
  messaging_postbacks: "Quick-reply taps",
  messaging_optins: "Opt-ins",
  messaging_referral: "Referrals",
};

export function SettingsScreen() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [health, setHealth] = useState<ConnectionHealth | null>(null);
  const [mode, setMode] = useState<"demo" | "configured">("demo");
  const [metaState] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("meta") ?? "");
  const [accountSaved] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("accountSaved") ?? "");
  const [accountError] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("accountError") ?? "");
  const [disconnectingId, setDisconnectingId] = useState("");
  const [disconnectError, setDisconnectError] = useState("");
  const [team, setTeam] = useState<TeamOverview | null>(null);
  const [teamManageable, setTeamManageable] = useState(true);
  const [teamError, setTeamError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(8);
  const [quietTz, setQuietTz] = useState("UTC");
  const [quietSaved, setQuietSaved] = useState(false);
  const [quietBusy, setQuietBusy] = useState(false);
  const [quietError, setQuietError] = useState("");

  useEffect(() => {
    void fetch("/api/workspace/messaging")
      .then((r) => r.json())
      .then((payload: { data?: { startHour: number; endHour: number; timezone: string } | null }) => {
        if (payload?.data) {
          setQuietEnabled(true);
          setQuietStart(payload.data.startHour);
          setQuietEnd(payload.data.endHour);
          setQuietTz(payload.data.timezone);
        }
      })
      .catch(() => undefined);
  }, []);

  async function saveMessagingWindow(enabled: boolean) {
    setQuietBusy(true);
    setQuietSaved(false);
    setQuietError("");
    try {
      const response = await fetch("/api/workspace/messaging", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(enabled ? { startHour: quietStart, endHour: quietEnd, timezone: quietTz.trim() || "UTC" } : null),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not save messaging hours.");
      }
      setQuietSaved(true);
      setTimeout(() => setQuietSaved(false), 2500);
    } catch (error) {
      setQuietError(error instanceof Error ? error.message : "Could not save messaging hours.");
    } finally {
      setQuietBusy(false);
    }
  }

  async function disconnect(id: string) {
    if (disconnectingId) return;
    setDisconnectingId(id);
    setDisconnectError("");
    try {
      const response = await fetch("/api/meta/connection", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Could not disconnect Instagram");
      setConnections((current) => current.filter((connection) => connection.id !== id));
    } catch (error) {
      setDisconnectError(error instanceof Error ? error.message : "Could not disconnect Instagram");
    } finally {
      setDisconnectingId("");
    }
  }

  useEffect(() => {
    void Promise.all([
      fetch("/api/meta/connection"),
      fetch("/api/health"),
      fetch("/api/meta/connection/health"),
    ]).then(async ([connectionResponse, healthResponse, connectionHealthResponse]) => {
      const connectionPayload = (await connectionResponse.json()) as { data?: Connection[] };
      const healthPayload = (await healthResponse.json()) as { mode?: "demo" | "configured" };
      const connectionHealthPayload = (await connectionHealthResponse.json()) as { data?: ConnectionHealth[] };
      setConnections(connectionPayload.data ?? []);
      setMode(healthPayload.mode ?? "demo");
      setHealth(connectionHealthPayload.data?.[0] ?? null);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch("/api/team/invitations").then(async (response) => {
      if (!response.ok) {
        setTeamManageable(false);
        return;
      }
      setTeam(await response.json() as TeamOverview);
    }).catch(() => setTeamManageable(false));
  }, []);

  async function refreshTeam() {
    const response = await fetch("/api/team/invitations");
    if (response.ok) setTeam(await response.json() as TeamOverview);
  }

  async function sendInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inviteBusy) return;
    setInviteBusy(true);
    setTeamError("");
    try {
      const response = await fetch("/api/team/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error === "already_member" ? "That person is already in the workspace." : "Could not send the invitation.");
      }
      setInviteEmail("");
      await refreshTeam();
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "Could not send the invitation.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function revokeInvitation(id: string) {
    setTeamError("");
    try {
      const response = await fetch(`/api/team/invitations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not revoke the invitation.");
      await refreshTeam();
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "Could not revoke the invitation.");
    }
  }

  const statusMessage: Record<string, string> = {
    connected: "Instagram is connected. The account is ready for review testing.",
    "missing-config": "Add your Meta App ID and redirect URI before connecting Instagram.",
    "missing-encryption-key": "Add META_TOKEN_ENCRYPTION_KEY before connecting an account.",
    "invalid-state": "The Meta sign-in expired. Start the connection again.",
    cancelled: "You cancelled the Instagram authorization — click Connect again whenever you're ready.",
    denied: "Instagram refused this connection before it started. Make sure this workspace owner has a role on the Meta app (or the app is Live with Instagram advanced access), then retry.",
    "token-exchange": "Instagram rejected the app credentials while finishing sign-in. Verify META_APP_ID and META_APP_SECRET in the deployment, and that this exact callback URL is listed under Valid OAuth Redirect URIs in the Meta app: {callbackUrl}",
    "missing-permissions": "Instagram signed in but did not approve every permission Linkar needs. Reconnect and accept all requested scopes — until the app passes App Review, the Instagram account must belong to a role on the Meta app.",
    "profile-fetch": "Signed in, but Linkar could not read the account profile back from Instagram. This is usually transient — retry the connection.",
    error: "Meta could not finish the connection. Check the app settings and try again.",
  };

  return (
    <AppShell>
      <div className="page-wrap narrow-wrap">
        <header className="page-header"><div><p className="eyebrow">Workspace / settings</p><h1>Connect your Instagram.</h1><p className="muted page-lede">{PRODUCT_NAME} uses Meta’s official Instagram APIs. You stay in control of the account and the rules.</p></div></header>

        {metaState && <div className={`notice-banner ${metaState === "connected" ? "notice-success" : "notice-warning"}`} role="status"><span>{metaState === "connected" ? <Check size={17} /> : <LockKeyhole size={17} />}</span><p>{statusMessage[metaState] ?? "Connection status updated."}</p></div>}

        <section className="settings-hero panel">
          <div className="settings-icon"><Camera size={25} /></div>
          <div className="settings-copy"><p className="eyebrow">Instagram connections</p><h2>{connections.length === 0 ? "No account connected" : `${connections.length} account${connections.length === 1 ? "" : "s"} connected`}</h2><p>{connections.length > 0 ? "Connected accounts receive comment and DM webhooks for this workspace." : "Connect a professional Instagram account to enable delivery."}</p></div>
          <div className="settings-action"><a className="button button-primary" href="/api/meta/oauth/start">{connections.length > 0 ? "Connect another account" : "Connect Instagram"} <ExternalLink size={15} /></a></div>
        </section>
        {connections.length > 0 && (
          <ul className="connection-list">
            {connections.map((connection) => (
              <li className="panel connection-row" key={connection.id}>
                <span className="connection-avatar">@{connection.username.slice(0, 2).toUpperCase()}</span>
                <div className="connection-copy">
                  <strong>@{connection.username}</strong>
                  <small>Connected {new Date(connection.connectedAt).toLocaleDateString()} · ID {connection.igUserId}</small>
                </div>
                <StatusBadge status={connection.status} />
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={disconnectingId === connection.id}
                  onClick={() => void disconnect(connection.id)}
                >
                  {disconnectingId === connection.id ? "Disconnecting…" : "Disconnect"}
                </button>
              </li>
            ))}
          </ul>
        )}
        {disconnectError && <p className="form-error" role="alert">{disconnectError}</p>}

        {connections.length > 0 && health && (
          <section className="panel settings-panel" aria-label="Webhook health">
            <div className="panel-heading">
              <div><p className="eyebrow">Webhook health</p><h2>{health.missingFields.length === 0 ? "All caught up" : "Some fields need a reconnect"}</h2></div>
              {health.missingFields.length === 0 ? <ShieldCheck size={21} /> : <AlertTriangle size={21} />}
            </div>
            {health.checkError ? (
              <p className="muted">Could not check with Meta right now: {health.checkError}</p>
            ) : (
              <ul className="check-list">
                {health.requiredFields.map((field) => {
                  const subscribed = !health.missingFields.includes(field);
                  return (
                    <li key={field}>
                      {subscribed ? <Check size={16} /> : <X size={16} />}
                      {WEBHOOK_FIELD_LABELS[field] ?? field}
                    </li>
                  );
                })}
              </ul>
            )}
            {(health.missingFields.length > 0 || health.checkError) && (
              <p className="muted">
                Reconnect Instagram to refresh the subscription. <a className="text-link" href="/api/meta/oauth/start">Reconnect <ExternalLink size={15} /></a>
              </p>
            )}
          </section>
        )}

        <div className="settings-grid">
          <section className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">Data handling</p><h2>Built for review</h2></div><ShieldCheck size={21} /></div><ul className="check-list"><li><Check size={16} /> Access tokens are encrypted at rest.</li><li><Check size={16} /> Webhook signatures are verified before processing.</li><li><Check size={16} /> Duplicate events are ignored safely.</li><li><Check size={16} /> Replies follow saved rules, never scraping.</li></ul></section>
          <section className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">App mode</p><h2>{mode === "demo" ? "Demo mode" : "Connected mode"}</h2></div><span className={`mode-orb ${mode === "demo" ? "orb-demo" : "orb-live"}`} /></div><p className="muted">{mode === "demo" ? "The workspace runs on sample data until DATABASE_URL and Meta credentials are configured." : "This workspace is configured for Meta-backed delivery."}</p><Link className="text-link" href="/support">Read setup support <ExternalLink size={15} /></Link></section>
        </div>

        <div className="settings-grid">
          <section className="panel settings-panel" aria-label="Account security">
            <div className="panel-heading"><div><p className="eyebrow">Account</p><h2>Sign-in & security</h2></div><LockKeyhole size={21} /></div>
            {accountSaved === "password" && <p className="form-success" role="status">Password updated.</p>}
            {accountError && <p className="form-error" role="alert">{accountError === "current" ? "That current password is incorrect." : accountError === "password" ? "The new password must be at least 12 characters." : "That action is not available."}</p>}
            <form action="/api/account" method="post" className="account-form">
              <input type="hidden" name="action" value="change-password" />
              <label className="field"><span>Current password</span><input name="currentPassword" type="password" autoComplete="current-password" required /></label>
              <label className="field"><span>New password</span><input name="newPassword" type="password" autoComplete="new-password" minLength={12} required /></label>
              <p className="muted">At least 12 characters. Your other devices stay signed in.</p>
              <button className="button button-secondary" type="submit">Update password</button>
            </form>
            <form action="/api/account" method="post">
              <input type="hidden" name="action" value="logout-all" />
              <button className="button button-secondary" type="submit">Sign out all devices</button>
            </form>
          </section>

          <section className="panel settings-panel" aria-label="Messaging hours">
            <div className="panel-heading"><div><p className="eyebrow">Delivery defaults</p><h2>Messaging quiet hours</h2></div><Clock size={21} /></div>
            <p className="muted">Sequences and broadcasts hold all DMs during this window (workspace time). Direct replies to a person’s own message are never delayed.</p>
            {quietError && <p className="form-error" role="alert">{quietError}</p>}
            <label className="field checkbox-field">
              <input type="checkbox" checked={quietEnabled} onChange={(event) => setQuietEnabled(event.target.checked)} />
              <span>Hold automated DMs during quiet hours</span>
            </label>
            {quietEnabled && (
              <div className="field-grid">
                <label className="field">
                  <span>Quiet from (hour)</span>
                  <select value={String(quietStart)} onChange={(e) => setQuietStart(Number(e.target.value))}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Quiet until (hour)</span>
                  <select value={String(quietEnd)} onChange={(e) => setQuietEnd(Number(e.target.value))}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Timezone</span>
                  <input value={quietTz} onChange={(e) => setQuietTz(e.target.value)} placeholder="Europe/Berlin" />
                </label>
              </div>
            )}
            <div className="builder-footer">
              <div>{quietSaved && <span className="form-success" role="status"><Check size={15} /> Saved.</span>}</div>
              <button className="button button-secondary" type="button" disabled={quietBusy} onClick={() => void saveMessagingWindow(quietEnabled)}>
                {quietBusy ? "Saving…" : "Save messaging hours"}
              </button>
            </div>
          </section>

          <section className="panel settings-panel" aria-label="Team">
            <div className="panel-heading"><div><p className="eyebrow">Team</p><h2>Members & invitations</h2></div><Users size={21} /></div>
            {teamError && <p className="form-error" role="alert">{teamError}</p>}
            {teamManageable && team ? (
              <>
                <ul className="team-list">
                  {team.members.map((member) => (
                    <li key={member.email}>
                      <span className="team-who"><strong>{member.email}</strong><small>{member.role}</small></span>
                    </li>
                  ))}
                  {team.invitations.map((invitation) => (
                    <li key={invitation.id}>
                      <span className="team-who"><strong>{invitation.email}</strong><small>{invitation.role} · invitation expires {new Date(invitation.expiresAt).toLocaleDateString()}</small></span>
                      <button className="text-link" type="button" onClick={() => void revokeInvitation(invitation.id)}>Revoke</button>
                    </li>
                  ))}
                </ul>
                <form className="invite-form" onSubmit={(event) => void sendInvitation(event)}>
                  <label className="field"><span>Invite by email</span><input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" placeholder="teammate@example.com" required /></label>
                  <label className="field"><span>Role</span>
                    <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </label>
                  <button className="button button-secondary" type="submit" disabled={inviteBusy}><UserPlus size={15} /> {inviteBusy ? "Inviting…" : "Invite"}</button>
                </form>
                <p className="muted">Invitations expire after 7 days and must be accepted with the invited email address.</p>
              </>
            ) : (
              <p className="muted">Only workspace owners and admins can manage the team.</p>
            )}
          </section>
        </div>

        <section className="review-links panel"><div><p className="eyebrow">Submission surfaces</p><h2>Public pages your reviewers can open</h2></div><div className="review-link-grid"><Link href="/privacy">Privacy policy <ExternalLink size={14} /></Link><Link href="/terms">Terms of service <ExternalLink size={14} /></Link><Link href="/data-deletion">Data deletion <ExternalLink size={14} /></Link><Link href="/support">Support <ExternalLink size={14} /></Link></div></section>
      </div>
    </AppShell>
  );
}
