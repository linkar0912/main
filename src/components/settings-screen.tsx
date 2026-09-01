"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Clock,
  ExternalLink,
  FileText,
  LockKeyhole,
  Plug,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "./app-shell";
import { ContextHelpLink } from "./context-help-link";
import { CopyDiagnosticsButton } from "./copy-diagnostics-button";
import { InstagramGlyph } from "./instagram-glyph";
import { FacebookGlyph } from "./facebook-glyph";
import { StatusBadge } from "./status-badge";
import type { ConnectionStatus } from "@/src/lib/repository";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { formatDate } from "@/src/lib/format-date";
import { clearWorkspaceDataCache, getInstagramConnections, getFacebookPages, getWorkspaceBootstrap, type FacebookPageSummary } from "@/src/lib/client/workspace-data";

type Connection = { id: string; igUserId: string; username: string; status: ConnectionStatus; connectedAt: string; profilePictureUrl?: string | null };
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
  const router = useRouter();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [health, setHealth] = useState<ConnectionHealth | null>(null);
  const [mode, setMode] = useState<"demo" | "configured">("demo");
  // useSearchParams (not a window.location initializer) so the server and the
  // first client render agree on this value - no hydration mismatch to fix up.
  const searchParams = useSearchParams();
  const metaState = searchParams.get("meta") ?? "";
  const facebookState = searchParams.get("facebook") ?? "";
  const [facebookPages, setFacebookPages] = useState<FacebookPageSummary[]>([]);
  const [facebookHealth, setFacebookHealth] = useState<{
    pageId: string;
    pageName: string;
    status: ConnectionStatus;
    checkError?: string;
    subscribedFields: string[];
    missingFields: string[];
  } | null>(null);
  const [facebookBusyId, setFacebookBusyId] = useState("");
  const [facebookError, setFacebookError] = useState("");
  const [facebookChoices, setFacebookChoices] = useState<Array<{ id: string; name: string; category?: string }>>([]);
  const [selectedFacebookPageId, setSelectedFacebookPageId] = useState("");
  const [facebookSelectionBusy, setFacebookSelectionBusy] = useState(false);
  const [section, setSection] = useState<"connections" | "delivery" | "team" | "policies">("connections");
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

  useEffect(() => {
    if (facebookState !== "select-page") return;
    void fetch("/api/facebook/oauth/pages")
      .then(async (response) => {
        const payload = await response.json() as { data?: Array<{ id: string; name: string; category?: string }>; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load Facebook Pages");
        const choices = payload.data ?? [];
        setFacebookChoices(choices);
        setSelectedFacebookPageId(choices[0]?.id ?? "");
      })
      .catch((error) => setFacebookError(error instanceof Error ? error.message : "Could not load Facebook Pages"));
  }, [facebookState]);

  async function connectSelectedFacebookPage() {
    if (!selectedFacebookPageId || facebookSelectionBusy) return;
    setFacebookSelectionBusy(true);
    setFacebookError("");
    try {
      const response = await fetch("/api/facebook/oauth/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pageId: selectedFacebookPageId }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not connect Facebook Page");
      router.push("/settings?facebook=connected");
    } catch (error) {
      setFacebookError(error instanceof Error ? error.message : "Could not connect Facebook Page");
      setFacebookSelectionBusy(false);
    }
  }

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
      clearWorkspaceDataCache("connections");
      setConnections((current) => current.filter((connection) => connection.id !== id));
    } catch (error) {
      setDisconnectError(error instanceof Error ? error.message : "Could not disconnect Instagram");
    } finally {
      setDisconnectingId("");
    }
  }

  useEffect(() => {
    void Promise.all([
      getInstagramConnections(),
      getFacebookPages(),
      getWorkspaceBootstrap().catch(() => null),
      fetch("/api/meta/connection/health"),
      fetch("/api/facebook/connection/health"),
    ]).then(async ([connectionData, fbPages, bootstrap, connectionHealthResponse, fbHealthResponse]) => {
      const connectionHealthPayload = (await connectionHealthResponse.json()) as { data?: ConnectionHealth[] };
      const fbHealthPayload = (await fbHealthResponse.json().catch(() => ({ data: [] }))) as {
        data?: Array<{ id: string; pageId: string; pageName: string; status: ConnectionStatus; checkError?: string; subscribedFields: string[]; missingFields: string[]; requiredFields: string[] }>;
      };
      setConnections(connectionData);
      setFacebookPages(fbPages);
      setMode(bootstrap?.mode ?? "demo");
      setHealth(connectionHealthPayload.data?.[0] ?? null);
      setFacebookHealth(fbHealthPayload.data?.[0] ?? null);
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
    cancelled: "You cancelled the Instagram authorization - click Connect again whenever you're ready.",
    denied: "Instagram refused this connection before it started. Make sure this workspace owner has a role on the Meta app (or the app is Live with Instagram advanced access), then retry.",
    "token-exchange": "Instagram rejected the app credentials while finishing sign-in. Verify META_APP_ID and META_APP_SECRET in the deployment, and that this exact callback URL is listed under Valid OAuth Redirect URIs in the Meta app: {callbackUrl}",
    "missing-permissions": "Instagram signed in but did not approve every permission Linkar needs. Reconnect and accept all requested scopes - until the app passes App Review, the Instagram account must belong to a role on the Meta app.",
    "profile-fetch": "Signed in, but Linkar could not read the account profile back from Instagram. This is usually transient - retry the connection.",
    "already-connected": "That Instagram account already belongs to another Linkar workspace. Disconnect it there before connecting it here.",
    error: "Meta could not finish the connection. Check the app settings and try again.",
  };

  const facebookStatusMessage: Record<string, string> = {
    connected: "Facebook Page is connected. The Page is ready to receive comment-reply webhooks.",
    "select-page": "Choose which Facebook Page Linkar should connect. Nothing is connected until you confirm.",
    "missing-config": "Add your Facebook App ID, App Secret, and redirect URI before connecting a Page.",
    "missing-encryption-key": "Add FACEBOOK_TOKEN_ENCRYPTION_KEY (or META_TOKEN_ENCRYPTION_KEY) before connecting a Page.",
    "invalid-state": "The Facebook sign-in expired. Start the connection again.",
    cancelled: "You cancelled the Facebook authorization - click Connect again whenever you're ready.",
    denied: "Facebook refused this connection before it started. Make sure this workspace owner has a role on the Meta app and that the Pages the user manages appear under their Business portfolio.",
    "token-exchange": "Facebook rejected the app credentials while finishing sign-in. Verify FACEBOOK_APP_ID and FACEBOOK_APP_SECRET, and that the callback URL is listed under Valid OAuth Redirect URIs in the Meta app.",
    "missing-permissions": "Facebook signed in but did not approve every permission Linkar needs (pages_show_list, pages_manage_metadata, pages_manage_engagement, pages_read_engagement, pages_read_user_content). Reconnect and accept all requested scopes.",
    "no-pages": "Signed in, but no Facebook Pages were found under this account. Create a Page in Business Manager or claim an existing one, then retry.",
    "page-listing": "Signed in, but Linkar could not read the Pages from Meta. This is usually transient - retry the connection.",
    "already-connected": "That Facebook Page already belongs to another Linkar workspace. Disconnect it there before connecting it here.",
    error: "Meta could not finish the Facebook connection. Check the app settings and try again.",
  };

  async function disconnectFacebook(id: string) {
    setFacebookBusyId(id);
    setFacebookError("");
    try {
      const response = await fetch("/api/facebook/connection", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Could not disconnect Facebook Page");
      clearWorkspaceDataCache("connections");
      setFacebookPages((current) => current.filter((page) => page.id !== id));
    } catch (error) {
      setFacebookError(error instanceof Error ? error.message : "Could not disconnect Facebook Page");
    } finally {
      setFacebookBusyId("");
    }
  }

  const sectionCounts = {
    connections: connections.length,
    team: (team?.members.length ?? 0) + (team?.invitations.length ?? 0),
  };
  const connectedChannelCount = Number(connections.length > 0) + Number(facebookPages.length > 0);

  return (
    <AppShell>
      <div className="page-wrap settings-wrap">
        <header className="page-header"><div><p className="eyebrow">Workspace / settings</p><h1>Workspace settings</h1><p className="muted page-lede">Manage Instagram and Facebook connections, delivery defaults, team access, and account safeguards.</p></div><div className="header-actions"><CopyDiagnosticsButton /><ContextHelpLink topic="connecting-instagram" /></div></header>

        <section className="settings-summary" aria-label="Workspace summary">
          <div className="settings-summary-intro">
            <p className="eyebrow">Control center</p>
            <strong>Everything your workspace needs, in one place.</strong>
          </div>
          <div className="settings-summary-stat">
            <span className={`mode-orb ${mode === "demo" ? "orb-demo" : "orb-live"}`} aria-hidden="true" />
            <span><small>Environment</small><strong>{mode === "demo" ? "Demo mode" : "Connected mode"}</strong></span>
          </div>
          <div className="settings-summary-stat">
            <Plug size={18} aria-hidden="true" />
            <span><small>Channels</small><strong>{connectedChannelCount} connected {connectedChannelCount === 1 ? "channel" : "channels"}</strong></span>
          </div>
        </section>

        {metaState && <div className={`notice-banner ${metaState === "connected" ? "notice-success" : "notice-warning"}`} role="status">{metaState === "connected" ? <Check size={17} /> : <LockKeyhole size={17} />}<p>{statusMessage[metaState] ?? "Connection status updated."}</p></div>}
        {facebookState && <div className={`notice-banner ${facebookState === "connected" ? "notice-success" : "notice-warning"}`} role="status">{facebookState === "connected" ? <Check size={17} /> : <LockKeyhole size={17} />}<p>{facebookStatusMessage[facebookState] ?? "Facebook connection status updated."}</p></div>}

        <div className="section-layout">
          <nav className="section-nav" aria-label="Settings sections">
            <button type="button" aria-pressed={section === "connections"} className={`section-nav-link ${section === "connections" ? "is-active" : ""}`} onClick={() => setSection("connections")}>
              <Plug size={16} strokeWidth={1.9} /> Connections
              <span className="section-nav-count">{sectionCounts.connections}</span>
            </button>
            <button type="button" aria-pressed={section === "delivery"} className={`section-nav-link ${section === "delivery" ? "is-active" : ""}`} onClick={() => setSection("delivery")}>
              <Clock size={16} strokeWidth={1.9} /> Delivery
            </button>
            <button type="button" aria-pressed={section === "team"} className={`section-nav-link ${section === "team" ? "is-active" : ""}`} onClick={() => setSection("team")}>
              <Users size={16} strokeWidth={1.9} /> Team
              <span className="section-nav-count">{sectionCounts.team}</span>
            </button>
            <button type="button" aria-pressed={section === "policies"} className={`section-nav-link ${section === "policies" ? "is-active" : ""}`} onClick={() => setSection("policies")}>
              <FileText size={16} strokeWidth={1.9} /> Policies
            </button>
            <Link className="section-nav-link settings-security-link" href="/profile">
              <LockKeyhole size={16} strokeWidth={1.9} /> Security <ExternalLink size={13} />
            </Link>
          </nav>

          <div className="section-content">
            {section === "connections" && (
              <div className="settings-overview-grid">
                <section className="settings-hero panel settings-card channel-settings-card instagram-settings-card" data-channel-card="instagram">
                  {connections[0]?.profilePictureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Meta serves avatars from its own CDN; next/image adds no value here.
                    <img
                      className="settings-avatar"
                      src={connections[0].profilePictureUrl}
                      alt={connections[0].username ? `@${connections[0].username} profile picture` : "Instagram profile picture"}
                    />
                  ) : (
                    <div className="settings-brand-icon"><InstagramGlyph size={30} brand /></div>
                  )}
                  <div className="settings-copy"><p className="eyebrow">Instagram connections</p><h2>{connections.length === 0 ? "No account connected" : `${connections.length} account${connections.length === 1 ? "" : "s"} connected`}</h2><p>{connections.length > 0 ? "Your connected accounts can receive comment and DM webhooks." : `Connect a professional account to start delivering ${PRODUCT_NAME} automations.`}</p></div>
                  <div className="settings-action"><a className="button button-primary" href="/api/meta/oauth/start">{connections.length > 0 ? "Connect another account" : "Connect Instagram"} <ExternalLink size={15} /></a></div>
                  {connections.length > 0 && (
                    <ul className="connection-list">
                      {connections.map((connection) => (
                        <li className="panel connection-row" key={connection.id}>
                          {connection.profilePictureUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- Meta CDN avatar; next/image adds no value for one remote photo.
                            <img
                              className="connection-avatar is-photo"
                              src={connection.profilePictureUrl}
                              alt={`@${connection.username} profile picture`}
                            />
                          ) : (
                            <span className="connection-avatar">@{connection.username.slice(0, 2).toUpperCase()}</span>
                          )}
                          <div className="connection-copy">
                            <strong>@{connection.username}</strong>
                            <small>Connected {formatDate(connection.connectedAt)} · ID {connection.igUserId}</small>
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
                    <div className="channel-health" data-channel-health="instagram" aria-label="Webhook health">
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
                    </div>
                  )}
                </section>

                <section className="settings-hero panel settings-card channel-settings-card facebook-settings-card" data-channel-card="facebook">
                  <div className="settings-brand-icon"><FacebookGlyph size={30} brand /></div>
                  <div className="settings-copy"><p className="eyebrow">Facebook Pages</p><h2>{facebookPages.length === 0 ? "No Page connected" : `${facebookPages.length} Page${facebookPages.length === 1 ? "" : "s"} connected`}</h2><p>{facebookPages.length > 0 ? "Connected Pages can deliver comment-reply automations on public posts." : "Connect a Facebook Page to auto-reply to comments with the same flows you use on Instagram."}</p></div>
                  <div className="settings-action"><a className="button button-primary" href="/api/facebook/oauth/start">{facebookPages.length > 0 ? "Connect another Page" : "Connect Facebook Page"} <ExternalLink size={15} /></a></div>
                  {facebookState === "select-page" && (
                    <div className="settings-copy">
                      <label className="field">
                        <span>Choose Facebook Page</span>
                        <select
                          aria-label="Choose Facebook Page"
                          value={selectedFacebookPageId}
                          onChange={(event) => setSelectedFacebookPageId(event.target.value)}
                        >
                          {facebookChoices.map((page) => (
                            <option key={page.id} value={page.id}>{page.name}{page.category ? `, ${page.category}` : ""}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={!selectedFacebookPageId || facebookSelectionBusy}
                        onClick={() => void connectSelectedFacebookPage()}
                      >
                        {facebookSelectionBusy ? "Connecting…" : "Connect selected Page"}
                      </button>
                    </div>
                  )}
                  {facebookPages.length > 0 && (
                    <ul className="connection-list">
                      {facebookPages.map((page) => (
                        <li className="panel connection-row" key={page.id}>
                          <span className="connection-avatar" aria-hidden="true">{(page.pageName ?? "?").slice(0, 2).toUpperCase()}</span>
                          <div className="connection-copy">
                            <strong>{page.pageName}</strong>
                            <small>Connected {formatDate(page.connectedAt)} · Page ID {page.pageId}</small>
                          </div>
                          <StatusBadge status={page.status} />
                          <button
                            className="button button-secondary"
                            type="button"
                            disabled={facebookBusyId === page.id}
                            onClick={() => void disconnectFacebook(page.id)}
                          >
                            {facebookBusyId === page.id ? "Disconnecting…" : "Disconnect"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {facebookError && <p className="form-error" role="alert">{facebookError}</p>}
                  {facebookPages.length > 0 && facebookHealth && (
                    <div className="channel-health" data-channel-health="facebook" aria-label="Facebook webhook health">
                    <div className="panel-heading">
                      <div><p className="eyebrow">Facebook webhook health</p><h2>{facebookHealth.missingFields.length === 0 ? "All caught up" : "Some fields need a reconnect"}</h2></div>
                      {facebookHealth.missingFields.length === 0 ? <ShieldCheck size={21} /> : <AlertTriangle size={21} />}
                    </div>
                    {facebookHealth.checkError ? (
                      <p className="muted">Could not check with Meta right now: {facebookHealth.checkError}</p>
                    ) : (
                      <ul className="check-list">
                        <li>
                          <Check size={16} />
                          Feed (Page posts + comments)
                        </li>
                      </ul>
                    )}
                    {(facebookHealth.missingFields.length > 0 || facebookHealth.checkError) && (
                      <p className="muted">
                        Reconnect the Page to refresh the subscription. <a className="text-link" href="/api/facebook/oauth/start">Reconnect <ExternalLink size={15} /></a>
                      </p>
                    )}
                    </div>
                  )}
                </section>
              </div>
            )}

            {section === "delivery" && (
              <div className="delivery-settings-layout">
                <section className="panel settings-panel settings-card" aria-label="Messaging hours">
                  <div className="panel-heading"><div><p className="eyebrow">Delivery defaults</p><h2>Messaging quiet hours</h2></div><Clock size={21} /></div>
                  <p className="muted">Sequences and broadcasts hold all DMs during this window (workspace time). Direct replies to a person’s own message are never delayed.</p>
                  {quietError && <p className="form-error" role="alert">{quietError}</p>}
                  <div className="delivery-status" data-enabled={quietEnabled}>
                    <span className={`mode-orb ${quietEnabled ? "orb-live" : "orb-demo"}`} aria-hidden="true" />
                    <strong>{quietEnabled ? "Quiet hours enabled" : "Quiet hours disabled"}</strong>
                  </div>
                  <div className="delivery-controls">
                    <label className="field checkbox-field">
                      <input type="checkbox" checked={quietEnabled} onChange={(event) => setQuietEnabled(event.target.checked)} />
                      <span>Hold automated DMs during quiet hours</span>
                    </label>
                    <div className="delivery-time-grid">
                      <label className="field">
                        <span>Start time</span>
                        <select value={String(quietStart)} disabled={!quietEnabled} onChange={(e) => setQuietStart(Number(e.target.value))}>
                          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                        </select>
                      </label>
                      <label className="field">
                        <span>End time</span>
                        <select value={String(quietEnd)} disabled={!quietEnabled} onChange={(e) => setQuietEnd(Number(e.target.value))}>
                          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                        </select>
                      </label>
                    </div>
                      <label className="field">
                        <span>Workspace timezone</span>
                        <input value={quietTz} disabled={!quietEnabled} onChange={(e) => setQuietTz(e.target.value)} placeholder="Europe/Berlin" />
                      </label>
                  </div>
                  <div className="builder-footer">
                    <div>{quietSaved && <span className="form-success" role="status"><Check size={15} /> Saved.</span>}</div>
                    <button className="button button-secondary" type="button" disabled={quietBusy} onClick={() => void saveMessagingWindow(quietEnabled)}>
                      {quietBusy ? "Saving…" : "Save messaging hours"}
                    </button>
                  </div>
                </section>

                <aside className="delivery-safeguards" aria-label="Delivery safeguards">
                  <section className="panel settings-panel settings-card"><div className="panel-heading"><div><p className="eyebrow">Data handling</p><h2>Protected by default</h2></div><ShieldCheck size={21} /></div><ul className="check-list"><li><Check size={16} /> Access tokens are encrypted at rest.</li><li><Check size={16} /> Webhook signatures are verified before processing.</li><li><Check size={16} /> Duplicate events are ignored safely.</li><li><Check size={16} /> Replies follow saved rules, never scraping.</li></ul></section>
                  <section className="panel settings-panel settings-card"><div className="panel-heading"><div><p className="eyebrow">Environment</p><h2>{mode === "demo" ? "Demo mode" : "Connected mode"}</h2></div><span className={`mode-orb ${mode === "demo" ? "orb-demo" : "orb-live"}`} /></div><p className="muted">{mode === "demo" ? "The workspace runs on sample data until DATABASE_URL and Meta credentials are configured." : "This workspace is configured for live Meta-backed delivery."}</p><Link className="text-link" href="/support">View setup guidance <ExternalLink size={15} /></Link></section>
                </aside>
              </div>
            )}

            {section === "team" && (
              <section className="panel settings-panel settings-card" aria-label="Team">
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
                          <span className="team-who"><strong>{invitation.email}</strong><small>{invitation.role} · invitation expires {formatDate(invitation.expiresAt)}</small></span>
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
            )}

            {section === "policies" && (
              <section className="review-links panel settings-card"><div><p className="eyebrow">Policies & support</p><h2>Public resources</h2></div><div className="review-link-grid"><Link href="/privacy">Privacy policy <ExternalLink size={14} /></Link><Link href="/terms">Terms of service <ExternalLink size={14} /></Link><Link href="/data-deletion">Data deletion <ExternalLink size={14} /></Link><Link href="/support">Support <ExternalLink size={14} /></Link></div></section>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
