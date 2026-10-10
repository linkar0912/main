"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronRight,
  Plus,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  LockKeyhole,
  Plug,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { BillingSettings } from "./billing-settings";
import { ContextHelpLink } from "./context-help-link";
import { CopyDiagnosticsButton } from "./copy-diagnostics-button";
import { InlineConfirm } from "./inline-confirm";
import { InstagramGlyph } from "./instagram-glyph";
import { FacebookGlyph } from "./facebook-glyph";
import { SocialAvatar } from "./social-avatar";
import type { ConnectionStatus } from "@/src/lib/repository";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { formatDate } from "@/src/lib/format-date";
import { toReadableApiError } from "@/src/lib/validation-error";
import { SettingsConnectionsContentSkeleton, Skeleton } from "./skeleton";
import { PageHeader } from "./page-header";
import {
  clearWorkspaceDataCache,
  getFacebookPages,
  getInstagramConnections,
  getMessagingSettings,
  getTeamOverview,
  getWorkspaceBootstrap,
  invalidateWorkspaceResource,
  notifyWorkspaceChanged,
  type FacebookPageSummary,
  type TeamOverview,
} from "@/src/lib/client/workspace-data";

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

const WEBHOOK_FIELD_LABELS: Record<string, string> = {
  comments: "Comments",
  messages: "Messages",
  messaging_postbacks: "Quick-reply taps",
  messaging_optins: "Opt-ins",
  messaging_referral: "Referrals",
};

function ConnectionStatusTag({ status }: { status: ConnectionStatus }) {
  return (
    <span className="connection-state" data-status={status.toLowerCase()}>
      <span className="connection-state-dot" aria-hidden="true" />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

type FacebookHealth = {
  id: string;
  pageId: string;
  pageName: string;
  status: ConnectionStatus;
  checkError?: string;
  subscribedFields: string[];
  missingFields: string[];
  requiredFields: string[];
};

const SETTINGS_SECTIONS = ["connections", "delivery", "billing", "team", "policies"] as const;

/** The browser's own zone, so a new quiet-hours window starts in local time. */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const FALLBACK_TIME_ZONES = ["UTC", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney"];

/** Every IANA zone the runtime knows, always including the current value. */
function timeZoneOptions(current: string): string[] {
  let zones: string[];
  try {
    zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : FALLBACK_TIME_ZONES;
  } catch {
    zones = FALLBACK_TIME_ZONES;
  }
  const all = new Set(["UTC", ...zones]);
  if (current) all.add(current);
  return [...all].sort((a, b) => (a === "UTC" ? -1 : b === "UTC" ? 1 : a.localeCompare(b)));
}

type QuietHours = { enabled: boolean; start: number; end: number; timezone: string };

function sameQuietHours(a: QuietHours, b: QuietHours): boolean {
  if (a.enabled !== b.enabled) return false;
  // The window fields only matter while quiet hours are on.
  return !a.enabled || (a.start === b.start && a.end === b.end && a.timezone === b.timezone);
}

type InviteErrorPayload = { error?: string; limit?: number } | null;

function inviteErrorMessage(payload: InviteErrorPayload): string {
  switch (payload?.error) {
    case "already_member":
      return "That person is already in the workspace.";
    case "invalid_email":
      return "Enter a valid email address.";
    case "limit_reached":
      return typeof payload.limit === "number"
        ? `Your plan includes ${payload.limit} team ${payload.limit === 1 ? "seat" : "seats"}, and pending invitations count toward them. Revoke an invitation or upgrade in Billing to add someone.`
        : "Your plan has no team seats left, and pending invitations count toward the limit. Revoke an invitation or upgrade in Billing to add someone.";
    case "entitlement_required":
      return "Your current plan does not include teammates. Upgrade in Billing to invite people to this workspace.";
    default:
      return "Could not send the invitation.";
  }
}
type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function SettingsScreen() {
  const router = useRouter();
  const [connections, setConnections] = useState<Connection[]>([]);
  // One entry per connected account, matched by id at render time - a
  // workspace with more than one connected Instagram account or Facebook Page
  // previously only ever saw health for whichever the API happened to list
  // first (`data?.[0]`), silently hiding the others' status entirely.
  const [health, setHealth] = useState<ConnectionHealth[]>([]);
  const [mode, setMode] = useState<"demo" | "configured">("demo");
  // useSearchParams (not a window.location initializer) so the server and the
  // first client render agree on this value - no hydration mismatch to fix up.
  const searchParams = useSearchParams();
  const metaState = searchParams.get("meta") ?? "";
  const facebookState = searchParams.get("facebook") ?? "";
  const [facebookPages, setFacebookPages] = useState<FacebookPageSummary[]>([]);
  const [facebookHealth, setFacebookHealth] = useState<FacebookHealth[]>([]);
  const [facebookBusyId, setFacebookBusyId] = useState("");
  const [facebookError, setFacebookError] = useState("");
  const [facebookChoices, setFacebookChoices] = useState<Array<{ id: string; name: string; category?: string }>>([]);
  const [selectedFacebookPageId, setSelectedFacebookPageId] = useState("");
  const [facebookSelectionBusy, setFacebookSelectionBusy] = useState(false);
  // The open section lives in the URL (?section=billing) so a refresh, the back
  // button and links from Help land on the right section.
  const requestedSection = searchParams.get("section");
  const urlSection: SettingsSection = SETTINGS_SECTIONS.includes(requestedSection as SettingsSection)
    ? requestedSection as SettingsSection
    : "connections";
  // A click shows its section immediately, before the URL update lands; once
  // the URL moves on (the push, or the back button) the URL decides again.
  const currentSearch = searchParams.toString();
  const [picked, setPicked] = useState<{ from: string; section: SettingsSection } | null>(null);
  // The URL moved (push landed, or Back/Forward): forget the pending click so
  // returning to an earlier URL shows that URL's section, not the old click.
  if (picked && picked.from !== currentSearch) setPicked(null);
  const section = picked && picked.from === currentSearch ? picked.section : urlSection;
  const setSection = (next: SettingsSection) => {
    setPicked({ from: currentSearch, section: next });
    router.push(next === "connections" ? "/settings" : `/settings?section=${next}`, { scroll: false });
  };
  const [disconnectingId, setDisconnectingId] = useState("");
  const [disconnectError, setDisconnectError] = useState("");
  // Disconnecting stops every automation on that account, so it takes a
  // second, explicit step that names the account.
  const [confirmingDisconnect, setConfirmingDisconnect] = useState<{ channel: "instagram" | "facebook"; id: string } | null>(null);
  const [team, setTeam] = useState<TeamOverview | null>(null);
  const [teamManageable, setTeamManageable] = useState(true);
  const [teamError, setTeamError] = useState("");
  const [teamNotice, setTeamNotice] = useState("");
  const [confirmingRevokeId, setConfirmingRevokeId] = useState("");
  const [revokingId, setRevokingId] = useState("");
  const [teamLoadError, setTeamLoadError] = useState("");
  const [connectionsLoadError, setConnectionsLoadError] = useState("");
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(8);
  const [quietTz, setQuietTz] = useState("UTC");
  // What the server holds, so the status line can say "not saved yet"
  // instead of claiming quiet hours are on before Save is pressed.
  const [quietPersisted, setQuietPersisted] = useState<QuietHours>({ enabled: false, start: 22, end: 8, timezone: "UTC" });
  const [quietSaved, setQuietSaved] = useState(false);
  const [quietBusy, setQuietBusy] = useState(false);
  const [quietError, setQuietError] = useState("");

  useEffect(() => {
    if (!quietSaved) return;
    const timer = window.setTimeout(() => setQuietSaved(false), 2500);
    return () => window.clearTimeout(timer);
  }, [quietSaved]);

  useEffect(() => {
    if (section !== "delivery") return;
    const controller = new AbortController();
    void getMessagingSettings(controller.signal)
      .then((data) => {
        if (data) {
          setQuietEnabled(true);
          setQuietStart(data.startHour);
          setQuietEnd(data.endHour);
          setQuietTz(data.timezone);
          setQuietPersisted({ enabled: true, start: data.startHour, end: data.endHour, timezone: data.timezone });
        } else {
          // Nothing saved yet: offer the browser's own zone rather than UTC.
          const local = browserTimeZone();
          setQuietTz(local);
          setQuietPersisted((current) => ({ ...current, timezone: local }));
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [section]);

  useEffect(() => {
    if (facebookState !== "select-page") return;
    // Aborted (not just abandoned) if facebookState changes or the component
    // unmounts before this resolves - otherwise a slow response could still
    // call setFacebookChoices/setFacebookError after the picker it's for is
    // long gone.
    const controller = new AbortController();
    void fetch("/api/facebook/oauth/pages", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { data?: Array<{ id: string; name: string; category?: string }>; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load Facebook Pages");
        const choices = payload.data ?? [];
        setFacebookChoices(choices);
        setSelectedFacebookPageId(choices[0]?.id ?? "");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFacebookError(error instanceof Error ? error.message : "Could not load Facebook Pages");
      });
    return () => controller.abort();
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
      if (!response.ok) throw new Error(toReadableApiError(payload.error, "Could not connect Facebook Page"));
      // router.push only swaps the URL - it doesn't remount this component, so
      // the connections/health fetched on initial mount would otherwise stay
      // stale and still show "No Page connected" until a manual reload.
      clearWorkspaceDataCache("connections");
      notifyWorkspaceChanged();
      const [fbPages, fbHealthResponse] = await Promise.all([
        getFacebookPages(),
        fetch("/api/facebook/connection/health"),
      ]);
      const fbHealthPayload = (await fbHealthResponse.json().catch(() => ({ data: [] }))) as { data?: FacebookHealth[] };
      setFacebookPages(fbPages);
      setFacebookHealth(fbHealthPayload.data ?? []);
      router.push("/settings?facebook=connected");
    } catch (error) {
      setFacebookError(error instanceof Error ? error.message : "Could not connect Facebook Page");
    } finally {
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
        throw new Error(toReadableApiError(payload.error, "Could not save messaging hours."));
      }
      invalidateWorkspaceResource("messaging-settings");
      setQuietPersisted({ enabled, start: quietStart, end: quietEnd, timezone: quietTz.trim() || "UTC" });
      setQuietSaved(true);
    } catch (error) {
      setQuietError(error instanceof Error ? error.message : "Could not save messaging hours.");
    } finally {
      setQuietBusy(false);
    }
  }

  async function disconnect(id: string) {
    // Scoped to this connection, not "is any disconnect in flight" - a
    // workspace with multiple Instagram accounts should be able to
    // disconnect one while another disconnect is still finishing, matching
    // how disconnectFacebook already behaves.
    if (disconnectingId === id) return;
    setDisconnectingId(id);
    setDisconnectError("");
    try {
      const response = await fetch("/api/meta/connection", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(response.status === 403 ? toReadableApiError(payload.error, "Could not disconnect Instagram") : "Could not disconnect Instagram");
      }
      clearWorkspaceDataCache("connections");
      // The sidebar avatar comes from the connected account.
      notifyWorkspaceChanged();
      setConfirmingDisconnect(null);
      setConnections((current) => current.filter((connection) => connection.id !== id));
      setHealth((current) => current.filter((entry) => entry.id !== id));
    } catch (error) {
      setDisconnectError(error instanceof Error ? error.message : "Could not disconnect Instagram");
    } finally {
      setDisconnectingId("");
    }
  }

  /**
   * Fetches connection state without touching the loading/error flags up front.
   * Split out from loadConnectionsData so the mount effect can call it without
   * a synchronous setState in the effect body (which cascades renders); the
   * initial state already is "loading, no error", so the reset those flags
   * would perform is a no-op on mount and only matters for the Retry path.
   */
  async function fetchConnectionsData(signal?: AbortSignal) {
    try {
      const [connectionData, fbPages, bootstrap] = await Promise.all([
        getInstagramConnections(),
        getFacebookPages(),
        getWorkspaceBootstrap().catch(() => null),
      ]);
      if (signal?.aborted) return;
      setConnections(connectionData);
      setFacebookPages(fbPages);
      setMode(bootstrap?.mode ?? "demo");
      setConnectionsLoading(false);

      // Provider health can be noticeably slower than our own connection
      // records. Do not make account names wait for those external checks.
      const [instagramHealth, facebookPageHealth] = await Promise.allSettled([
        fetch("/api/meta/connection/health", { signal }).then((response) => response.json() as Promise<{ data?: ConnectionHealth[] }>),
        fetch("/api/facebook/connection/health", { signal }).then((response) => response.json() as Promise<{ data?: FacebookHealth[] }>),
      ]);
      if (signal?.aborted) return;
      if (instagramHealth.status === "fulfilled") setHealth(instagramHealth.value.data ?? []);
      if (facebookPageHealth.status === "fulfilled") setFacebookHealth(facebookPageHealth.value.data ?? []);
    } catch {
      if (signal?.aborted) return;
      // A network blip here previously left the page silently showing "No
      // account connected" / "No Page connected" - indistinguishable from
      // actually having no connections, which reads as "your accounts got
      // disconnected" rather than "something failed to load."
      setConnectionsLoadError("Could not load your connections. Check your connection and try again.");
    } finally {
      if (!signal?.aborted) setConnectionsLoading(false);
    }
  }

  /** Retry entry point: clears the previous outcome, then refetches. */
  async function loadConnectionsData() {
    setConnectionsLoading(true);
    setConnectionsLoadError("");
    await fetchConnectionsData();
  }

  useEffect(() => {
    // Called from inside an async callback rather than directly in the effect
    // body: the state updates all happen after an await, and this is the shape
    // the sibling effects in this file already use.
    const controller = new AbortController();
    void (async () => { await fetchConnectionsData(controller.signal); })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (section !== "team") return;
    const controller = new AbortController();
    void getTeamOverview(controller.signal).then(setTeam).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      if ((reason as { status?: number })?.status === 403) {
        setTeamManageable(false);
        return;
      }
      setTeamLoadError("Could not load team settings. Check your connection and try again.");
    });
    return () => controller.abort();
  }, [section]);

  async function refreshTeam() {
    invalidateWorkspaceResource("team-overview");
    setTeam(await getTeamOverview());
  }

  async function sendInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inviteBusy) return;
    setInviteBusy(true);
    setTeamError("");
    setTeamNotice("");
    const invitedEmail = inviteEmail.trim();
    let emailDelivered = true;
    try {
      const response = await fetch("/api/team/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as InviteErrorPayload;
        throw new Error(inviteErrorMessage(payload));
      }
      const created = await response.json().catch(() => null) as { emailDelivered?: boolean } | null;
      emailDelivered = created?.emailDelivered !== false;
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "Could not send the invitation.");
      setInviteBusy(false);
      return;
    }
    // The invitation exists from here on. A failed list refresh must not read
    // as a failed invite, or people send it again.
    setInviteEmail("");
    if (emailDelivered) {
      setTeamNotice(`Invitation sent to ${invitedEmail}.`);
    } else {
      setTeamError("The invitation was saved, but the email could not be sent. Revoke it and invite again once email delivery is working.");
    }
    try {
      await refreshTeam();
    } catch {
      setTeamError("The team list could not refresh. Reload the page to see the new invitation.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function revokeInvitation(id: string) {
    if (revokingId) return;
    setRevokingId(id);
    setTeamError("");
    setTeamNotice("");
    try {
      const response = await fetch(`/api/team/invitations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not revoke the invitation.");
      setConfirmingRevokeId("");
      await refreshTeam().catch(() => {
        // Already revoked on the server: drop the row locally instead of
        // reporting a failure for an action that worked.
        setTeam((current) => current ? { ...current, invitations: current.invitations.filter((invitation) => invitation.id !== id) } : current);
      });
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "Could not revoke the invitation.");
    } finally {
      setRevokingId("");
    }
  }

  const statusMessage: Record<string, string> = {
    connected: "Instagram is connected. The account is ready for review testing.",
    "missing-config": "Instagram setup is not complete yet. Ask the workspace administrator to finish the connection settings.",
    "missing-encryption-key": "Secure connection storage is not ready yet. Ask the workspace administrator to finish setup.",
    "invalid-state": "The Meta sign-in expired. Start the connection again.",
    cancelled: "You cancelled the Instagram authorization - click Connect again whenever you're ready.",
    denied: "Instagram refused this connection before it started. Make sure this workspace owner has a role on the Meta app (or the app is Live with Instagram advanced access), then retry.",
    "token-exchange": "Instagram could not finish signing in. Check the connection settings or contact support. Callback address: {callbackUrl}",
    "missing-permissions": "Instagram did not approve everything Linkar needs. Reconnect and allow every requested permission.",
    "profile-fetch": "Signed in, but Linkar could not read the account profile back from Instagram. This is usually transient - retry the connection.",
    "already-connected": "That Instagram account already belongs to another Linkar workspace. Disconnect it there before connecting it here.",
    forbidden: "Only workspace owners and admins can connect Instagram accounts. Ask one of them to connect it.",
    error: "Meta could not finish the connection. Check the app settings and try again.",
  };

  const facebookStatusMessage: Record<string, string> = {
    connected: "Facebook Page is connected and ready to reply to comments.",
    "select-page": "Choose which Facebook Page Linkar should connect. Nothing is connected until you confirm.",
    "missing-config": "Facebook setup is not complete yet. Ask the workspace administrator to finish the connection settings.",
    "missing-encryption-key": "Secure connection storage is not ready yet. Ask the workspace administrator to finish setup.",
    "invalid-state": "The Facebook sign-in expired. Start the connection again.",
    cancelled: "You cancelled the Facebook authorization - click Connect again whenever you're ready.",
    denied: "Facebook refused this connection before it started. Make sure this workspace owner has a role on the Meta app and that the Pages the user manages appear under their Business portfolio.",
    "token-exchange": "Facebook could not finish signing in. Check the connection settings or contact support.",
    "missing-permissions": "Facebook did not approve everything Linkar needs. Reconnect and allow every requested permission.",
    "no-pages": "Signed in, but no Facebook Pages were found under this account. Create a Page in Business Manager or claim an existing one, then retry.",
    "page-listing": "Signed in, but Linkar could not read the Pages from Meta. This is usually transient - retry the connection.",
    "already-connected": "That Facebook Page already belongs to another Linkar workspace. Disconnect it there before connecting it here.",
    error: "Meta could not finish the Facebook connection. Check the app settings and try again.",
  };

  async function disconnectFacebook(id: string) {
    if (facebookBusyId === id) return;
    setFacebookBusyId(id);
    setFacebookError("");
    try {
      const response = await fetch("/api/facebook/connection", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(response.status === 403 ? toReadableApiError(payload.error, "Could not disconnect Facebook Page") : "Could not disconnect Facebook Page");
      }
      clearWorkspaceDataCache("connections");
      notifyWorkspaceChanged();
      setConfirmingDisconnect(null);
      setFacebookPages((current) => current.filter((page) => page.id !== id));
      setFacebookHealth((current) => current.filter((entry) => entry.id !== id));
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

  const healthEntries = [...health, ...facebookHealth];
  const webhookState = connectedChannelCount === 0
    ? "none"
    : healthEntries.length === 0
      ? "checking"
      : healthEntries.some((entry) => entry.checkError || entry.missingFields.length > 0) ? "warn" : "ok";

  const navGroups: Array<{ label: string; items: Array<{ key: typeof section; label: string; icon: typeof Plug; count?: number }> }> = [
    {
      label: "Workspace",
      items: [
        { key: "connections", label: "Connections", icon: Plug, count: connectionsLoading ? undefined : connections.length + facebookPages.length },
        { key: "delivery", label: "Delivery", icon: Clock },
        { key: "team", label: "Team", icon: Users, count: team ? sectionCounts.team : undefined },
      ],
    },
    {
      label: "Account",
      items: [
        { key: "billing", label: "Billing", icon: CreditCard },
        { key: "policies", label: "Policies", icon: FileText },
      ],
    },
  ];

  const timeOptions = Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>);
  const quietDirty = !sameQuietHours({ enabled: quietEnabled, start: quietStart, end: quietEnd, timezone: quietTz }, quietPersisted);

  return (
    <div className="page-wrap settings-wrap">
      <PageHeader
        title="Settings"
        description="Channels, delivery, team and billing for this workspace."
        actions={<><CopyDiagnosticsButton /><ContextHelpLink topic="connecting-instagram" /></>}
      />

      {metaState && <div className={`notice-banner ${metaState === "connected" ? "notice-success" : "notice-warning"}`} role="status">{metaState === "connected" ? <Check size={17} /> : <LockKeyhole size={17} />}<p>{statusMessage[metaState] ?? "Connection status updated."}</p></div>}
      {facebookState && <div className={`notice-banner ${facebookState === "connected" ? "notice-success" : "notice-warning"}`} role="status">{facebookState === "connected" ? <Check size={17} /> : <LockKeyhole size={17} />}<p>{facebookStatusMessage[facebookState] ?? "Facebook connection status updated."}</p></div>}

      <div className="settings-shell">
        <nav className="settings-nav" aria-label="Settings sections">
          {navGroups.map((group) => (
            <div className="settings-nav-group" key={group.label}>
              <span className="settings-nav-label">{group.label}</span>
              {group.items.map(({ key, label, icon: Icon, count }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={section === key}
                  className={`settings-nav-link ${section === key ? "is-active" : ""}`}
                  onClick={() => setSection(key)}
                >
                  <Icon size={16} strokeWidth={1.9} />
                  <span>{label}</span>
                  {count !== undefined ? <span className="settings-nav-count">{count}</span> : null}
                </button>
              ))}
              {group.label === "Account" ? (
                <Link className="settings-nav-link" href="/profile">
                  <LockKeyhole size={16} strokeWidth={1.9} />
                  <span>Security</span>
                  <ChevronRight className="settings-nav-arrow" size={14} />
                </Link>
              ) : null}
            </div>
          ))}
        </nav>

        <div className="settings-main">
          {section === "connections" && (
            <section className="settings-section" aria-labelledby="connected-channels-title">
              <header className="settings-section-head">
                <h2 id="connected-channels-title">Connected channels</h2>
                <p>The Instagram accounts and Facebook Pages that listen for comments and deliver replies.</p>
              </header>

              {connectionsLoadError && (
                <div className="notice-banner notice-warning" role="alert">
                  <LockKeyhole size={17} />
                  <p>{connectionsLoadError} <button className="text-link" type="button" onClick={() => void loadConnectionsData()}>Retry</button></p>
                </div>
              )}

              <section className="settings-overview" aria-label="Workspace pulse">
                <div className="settings-overview-cell" role="group" aria-label="Channel status">
                  <small>Channels</small>
                  <strong>{connectionsLoading ? <Skeleton className="skeleton-word skeleton-row-meta" /> : `${connectedChannelCount} connected ${connectedChannelCount === 1 ? "channel" : "channels"}`}</strong>
                </div>
                <div className="settings-overview-cell" role="group" aria-label="Environment status">
                  <small>Environment</small>
                  <strong>
                    {connectionsLoading ? <Skeleton className="skeleton-word skeleton-row-meta" /> : (
                      <><span className={`mode-orb ${mode === "demo" ? "orb-demo" : "orb-live"}`} aria-hidden="true" />{mode === "demo" ? "Demo mode" : "Connected mode"}</>
                    )}
                  </strong>
                </div>
                <div className="settings-overview-cell" role="group" aria-label="Live updates status">
                  <small>Live updates</small>
                  <strong>
                    {connectionsLoading ? <Skeleton className="skeleton-word skeleton-row-meta" /> : (
                      <><span className="health-orb" data-state={webhookState === "ok" ? "ok" : webhookState === "warn" ? "warn" : "idle"} aria-hidden="true" />
                        {webhookState === "ok" ? "Healthy" : webhookState === "warn" ? "Needs attention" : webhookState === "checking" ? "Checking…" : "Nothing to check"}</>
                    )}
                  </strong>
                </div>
              </section>

              {connectionsLoading ? <SettingsConnectionsContentSkeleton /> : (
                <>
                  <section className="settings-group channel-settings-card" data-channel-card="instagram" aria-label="Instagram channel">
                    <div className="settings-group-head">
                      <span className="settings-group-icon"><InstagramGlyph size={22} brand /></span>
                      <div className="settings-group-copy">
                        <h3><span>Instagram connections</span></h3>
                        <p><span id="instagram-channel-title" className="channel-count" data-empty={connections.length === 0}>{connections.length === 0 ? "No account connected" : `${connections.length} account${connections.length === 1 ? "" : "s"} connected`}</span><span className="channel-capability">{connections.length > 0 ? "Comments and direct messages" : `Connect a professional account to start delivering ${PRODUCT_NAME} automations.`}</span></p>
                      </div>
                      <a className="button button-secondary button-small" href="/api/meta/oauth/start">{connections.length > 0 ? <><Plus size={14} /> Connect another</> : <>Connect Instagram <ExternalLink size={13} /></>}</a>
                    </div>
                    {connections.length > 0 && (
                      <ul className="settings-rows connection-list">
                        {connections.map((connection) => {
                          const accountHealth = health.find((entry) => entry.id === connection.id);
                          return (
                            <li className="settings-row connection-row" key={connection.id}>
                              <div className="connection-main">
                                <SocialAvatar channel="instagram" name={`@${connection.username}`} src={connection.profilePictureUrl ?? undefined} />
                                <div className="connection-copy">
                                  <span className="connection-title"><strong>@{connection.username}</strong><ConnectionStatusTag status={connection.status} /></span>
                                  <small title={`Instagram account ID ${connection.igUserId}`}>Connected {formatDate(connection.connectedAt)}</small>
                                </div>
                                <div className="connection-actions">
                                  <button
                                    className="connection-disconnect"
                                    type="button"
                                    disabled={disconnectingId === connection.id}
                                    aria-expanded={confirmingDisconnect?.id === connection.id}
                                    onClick={() => setConfirmingDisconnect({ channel: "instagram", id: connection.id })}
                                  >
                                    {disconnectingId === connection.id ? "Disconnecting…" : "Disconnect"}
                                  </button>
                                </div>
                              </div>
                              {confirmingDisconnect?.channel === "instagram" && confirmingDisconnect.id === connection.id ? (
                                <InlineConfirm
                                  label={`Confirm disconnecting @${connection.username}`}
                                  message={<>Disconnect <strong>@{connection.username}</strong>? Every automation on this account stops replying to comments and messages until you connect it again.</>}
                                  confirmLabel={`Disconnect @${connection.username}`}
                                  busyLabel="Disconnecting…"
                                  busy={disconnectingId === connection.id}
                                  onConfirm={() => void disconnect(connection.id)}
                                  onCancel={() => setConfirmingDisconnect(null)}
                                />
                              ) : null}
                              {accountHealth ? (
                                <div
                                  className="channel-health"
                                  data-channel-health="instagram"
                                  data-state={accountHealth.checkError ? "error" : accountHealth.missingFields.length === 0 ? "ok" : "warn"}
                                  aria-label={connections.length > 1 ? `Connection check for @${connection.username}` : "Connection check"}
                                >
                                  <span className="health-orb" data-state={accountHealth.checkError ? "error" : accountHealth.missingFields.length === 0 ? "ok" : "warn"} aria-hidden="true" />
                                  <div className="health-copy">
                                    <strong>
                                      {connections.length > 1 ? `@${connection.username}: ` : ""}
                                      {accountHealth.missingFields.length === 0 ? "All caught up" : "Some fields need a reconnect"}
                                    </strong>
                                    {accountHealth.checkError ? (
                                      <p className="muted">Could not check with Meta right now: {accountHealth.checkError}</p>
                                    ) : (
                                      <ul className="health-fields">
                                        {accountHealth.requiredFields.map((field) => (
                                          <li key={field} data-live={!accountHealth.missingFields.includes(field)}>{WEBHOOK_FIELD_LABELS[field] ?? field}</li>
                                        ))}
                                      </ul>
                                    )}
                                    {(accountHealth.missingFields.length > 0 || accountHealth.checkError) && (
                                      <p className="muted">
                                        Reconnect Instagram to refresh the subscription. <a className="text-link" href="/api/meta/oauth/start">Reconnect <ExternalLink size={13} /></a>
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {disconnectError && <p className="form-error settings-row-error" role="alert">{disconnectError}</p>}
                  </section>

                  <section className="settings-group channel-settings-card" data-channel-card="facebook" aria-label="Facebook channel">
                    <div className="settings-group-head">
                      <span className="settings-group-icon"><FacebookGlyph size={22} brand /></span>
                      <div className="settings-group-copy">
                        <h3><span>Facebook Pages</span></h3>
                        <p><span id="facebook-channel-title" className="channel-count" data-empty={facebookPages.length === 0}>{facebookPages.length === 0 ? "No Page connected" : `${facebookPages.length} Page${facebookPages.length === 1 ? "" : "s"} connected`}</span><span className="channel-capability">{facebookPages.length > 0 ? "Public Page comments" : "Connect a Page to auto-reply to comments on public posts."}</span></p>
                      </div>
                      <a className="button button-secondary button-small" href="/api/facebook/oauth/start">{facebookPages.length > 0 ? <><Plus size={14} /> Connect another</> : <>Connect Facebook Page <ExternalLink size={13} /></>}</a>
                    </div>
                    {facebookState === "select-page" && (
                      <div className="settings-row page-picker">
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
                      <ul className="settings-rows connection-list">
                        {facebookPages.map((page) => {
                          const pageHealth = facebookHealth.find((entry) => entry.id === page.id);
                          return (
                            <li className="settings-row connection-row" key={page.id}>
                              <div className="connection-main">
                                {/* Facebook's literal brand blue is set inline (matches FacebookGlyph.tsx) rather than
                                    in globals.css - the workspace palette contract (globals.test.ts) forbids legacy
                                    Meta blue in the shared stylesheet. */}
                                <SocialAvatar channel="facebook" name={page.pageName} src={page.avatarUrl} />
                                <div className="connection-copy">
                                  <span className="connection-title"><strong>{page.pageName}</strong><ConnectionStatusTag status={page.status} /></span>
                                  <small title={`Facebook Page ID ${page.pageId}`}>Connected {formatDate(page.connectedAt)}</small>
                                </div>
                                <div className="connection-actions">
                                  <button
                                    className="connection-disconnect"
                                    type="button"
                                    disabled={facebookBusyId === page.id}
                                    aria-expanded={confirmingDisconnect?.id === page.id}
                                    onClick={() => setConfirmingDisconnect({ channel: "facebook", id: page.id })}
                                  >
                                    {facebookBusyId === page.id ? "Disconnecting…" : "Disconnect"}
                                  </button>
                                </div>
                              </div>
                              {confirmingDisconnect?.channel === "facebook" && confirmingDisconnect.id === page.id ? (
                                <InlineConfirm
                                  label={`Confirm disconnecting ${page.pageName}`}
                                  message={<>Disconnect <strong>{page.pageName}</strong>? Every automation on this Page stops replying to comments until you connect it again.</>}
                                  confirmLabel={`Disconnect ${page.pageName}`}
                                  busyLabel="Disconnecting…"
                                  busy={facebookBusyId === page.id}
                                  onConfirm={() => void disconnectFacebook(page.id)}
                                  onCancel={() => setConfirmingDisconnect(null)}
                                />
                              ) : null}
                              {pageHealth ? (
                                <div
                                  className="channel-health"
                                  data-channel-health="facebook"
                                  data-state={pageHealth.checkError ? "error" : pageHealth.missingFields.length === 0 ? "ok" : "warn"}
                                  aria-label={facebookPages.length > 1 ? `Facebook connection check for ${page.pageName}` : "Facebook connection check"}
                                >
                                  <span className="health-orb" data-state={pageHealth.checkError ? "error" : pageHealth.missingFields.length === 0 ? "ok" : "warn"} aria-hidden="true" />
                                  <div className="health-copy">
                                    <strong>
                                      {facebookPages.length > 1 ? `${page.pageName}: ` : ""}
                                      {pageHealth.missingFields.length === 0 ? "All caught up" : "Some fields need a reconnect"}
                                    </strong>
                                    {pageHealth.checkError ? (
                                      <p className="muted">Could not check with Meta right now: {pageHealth.checkError}</p>
                                    ) : (
                                      <ul className="health-fields">
                                        <li data-live="true">Feed (Page posts + comments)</li>
                                      </ul>
                                    )}
                                    {(pageHealth.missingFields.length > 0 || pageHealth.checkError) && (
                                      <p className="muted">
                                        Reconnect the Page to refresh the subscription. <a className="text-link" href="/api/facebook/oauth/start">Reconnect <ExternalLink size={13} /></a>
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {facebookError && <p className="form-error settings-row-error" role="alert">{facebookError}</p>}
                  </section>
                </>
              )}
            </section>
          )}

          {section === "delivery" && (
            <section className="settings-section" aria-labelledby="delivery-title">
              <header className="settings-section-head">
                <h2 id="delivery-title">Delivery</h2>
                <p>When automated messages are allowed to go out, and how Linkar keeps delivery safe.</p>
              </header>

              <section className="settings-group" aria-label="Messaging hours">
                <div className="settings-group-head">
                  <span className="settings-group-icon"><Clock size={18} /></span>
                  <div className="settings-group-copy">
                    <h3>Messaging quiet hours</h3>
                    <p>Sequences and broadcasts hold all DMs during this window. Direct replies to a person’s own message are never delayed.</p>
                  </div>
                </div>
                {quietError && <p className="form-error settings-row-error" role="alert">{quietError}</p>}
                <div className="settings-rows">
                  <div className="settings-row settings-row-split">
                    <div className="settings-row-copy">
                      <strong>Hold automated DMs during quiet hours</strong>
                      <small className="delivery-status" data-enabled={quietEnabled} data-unsaved={quietDirty || undefined}>
                        {quietDirty
                          ? quietEnabled ? "Quiet hours on, not saved yet" : "Quiet hours off, not saved yet"
                          : quietEnabled ? "Quiet hours enabled" : "Quiet hours disabled"}
                      </small>
                    </div>
                    <label className="settings-switch">
                      <input type="checkbox" role="switch" aria-label="Hold automated DMs during quiet hours" checked={quietEnabled} onChange={(event) => setQuietEnabled(event.target.checked)} />
                      <span aria-hidden="true" />
                    </label>
                  </div>
                  <div className="settings-row settings-row-split" data-disabled={!quietEnabled}>
                    <div className="settings-row-copy">
                      <strong>Quiet window</strong>
                      <small>Messages queued in this window go out when it ends.</small>
                    </div>
                    <div className="settings-inline-fields">
                      <label className="field">
                        <span>Start time</span>
                        <select value={String(quietStart)} disabled={!quietEnabled} onChange={(e) => setQuietStart(Number(e.target.value))}>{timeOptions}</select>
                      </label>
                      <label className="field">
                        <span>End time</span>
                        <select value={String(quietEnd)} disabled={!quietEnabled} onChange={(e) => setQuietEnd(Number(e.target.value))}>{timeOptions}</select>
                      </label>
                    </div>
                  </div>
                  <div className="settings-row settings-row-split" data-disabled={!quietEnabled}>
                    <div className="settings-row-copy">
                      <strong>Timezone</strong>
                      <small>The quiet window follows this clock.</small>
                    </div>
                    <div className="settings-inline-fields">
                      <label className="field">
                        <span>Workspace timezone</span>
                        <select value={quietTz} disabled={!quietEnabled} onChange={(e) => setQuietTz(e.target.value)}>
                          {timeZoneOptions(quietTz).map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="settings-group-foot">
                  {quietSaved ? <span className="form-success" role="status"><Check size={15} /> Saved.</span> : quietDirty ? <span className="muted">Unsaved changes</span> : <span />}
                  <button className="button button-primary button-small" type="button" disabled={quietBusy} onClick={() => void saveMessagingWindow(quietEnabled)}>
                    {quietBusy ? "Saving…" : "Save messaging hours"}
                  </button>
                </div>
              </section>

              <aside className="settings-group" aria-label="Delivery safeguards">
                <div className="settings-group-head">
                  <span className="settings-group-icon"><ShieldCheck size={18} /></span>
                  <div className="settings-group-copy">
                    <h3>Protected by default</h3>
                    <p>These safeguards are always on and cannot be switched off.</p>
                  </div>
                </div>
                <ul className="settings-rows check-list">
                  <li className="settings-row"><Check size={16} /> Connection details are stored securely.</li>
                  <li className="settings-row"><Check size={16} /> Updates from connected apps are checked before use.</li>
                  <li className="settings-row"><Check size={16} /> Repeated updates are ignored safely.</li>
                  <li className="settings-row"><Check size={16} /> Replies follow only the rules you save.</li>
                  <li className="settings-row settings-row-split">
                    <span className="settings-row-copy">
                      <strong><span className={`mode-orb ${mode === "demo" ? "orb-demo" : "orb-live"}`} aria-hidden="true" /> {mode === "demo" ? "Demo mode" : "Connected mode"}</strong>
                      <small>{mode === "demo" ? "Live delivery isn't set up for this workspace yet, so it runs on sample data." : "This workspace delivers live replies through Instagram and Facebook."}</small>
                    </span>
                    <Link className="text-link" href="/support">Setup guidance <ExternalLink size={13} /></Link>
                  </li>
                </ul>
              </aside>
            </section>
          )}

          {section === "team" && (
            <section className="settings-section" aria-labelledby="team-title">
              <header className="settings-section-head">
                <h2 id="team-title">Team</h2>
                <p>Who can work in this workspace. Invitations expire after 7 days and must be accepted with the invited email address.</p>
              </header>
              {teamNotice && <p className="form-success" role="status"><Check size={15} /> {teamNotice}</p>}
              {teamError && <p className="form-error" role="alert">{teamError}</p>}
              {teamLoadError && <p className="form-error" role="alert">{teamLoadError}</p>}
              {teamManageable && team ? (
                <>
                  <section className="settings-group" aria-label="Team">
                    <div className="settings-group-head">
                      <span className="settings-group-icon"><Users size={18} /></span>
                      <div className="settings-group-copy">
                        <h3>Members & invitations</h3>
                        <p>{team.members.length} {team.members.length === 1 ? "member" : "members"}{team.invitations.length ? ` · ${team.invitations.length} pending` : ""}</p>
                      </div>
                    </div>
                    <ul className="settings-rows team-list">
                      {team.members.map((member) => (
                        <li className="settings-row settings-row-split" key={member.email}>
                          <span className="team-who">
                            <span className="avatar avatar-small" aria-hidden>{member.email.slice(0, 2).toUpperCase()}</span>
                            <strong>{member.email}</strong>
                          </span>
                          <span className="role-tag">{member.role.charAt(0) + member.role.slice(1).toLowerCase()}</span>
                        </li>
                      ))}
                      {team.invitations.map((invitation) => (
                        <li className="settings-row settings-row-split" key={invitation.id}>
                          <span className="team-who">
                            <span className="avatar avatar-small is-pending" aria-hidden>{invitation.email.slice(0, 2).toUpperCase()}</span>
                            <span><strong>{invitation.email}</strong><small>{invitation.role} · invitation expires {formatDate(invitation.expiresAt)}</small></span>
                          </span>
                          <button
                            className="text-link"
                            type="button"
                            disabled={revokingId === invitation.id}
                            aria-expanded={confirmingRevokeId === invitation.id}
                            aria-label={`Revoke invitation for ${invitation.email}`}
                            onClick={() => setConfirmingRevokeId(invitation.id)}
                          >
                            {revokingId === invitation.id ? "Revoking…" : "Revoke"}
                          </button>
                          {confirmingRevokeId === invitation.id ? (
                            <InlineConfirm
                              label={`Confirm revoking the invitation for ${invitation.email}`}
                              message={<>Revoke the invitation for <strong>{invitation.email}</strong>? Their invite link stops working right away.</>}
                              confirmLabel="Revoke invitation"
                              busyLabel="Revoking…"
                              busy={revokingId === invitation.id}
                              onConfirm={() => void revokeInvitation(invitation.id)}
                              onCancel={() => setConfirmingRevokeId("")}
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className="settings-group" aria-label="Invite a teammate">
                    <div className="settings-group-head">
                      <span className="settings-group-icon"><UserPlus size={18} /></span>
                      <div className="settings-group-copy">
                        <h3>Invite a teammate</h3>
                        <p>They get an email with a link to join this workspace.</p>
                      </div>
                    </div>
                    <form className="settings-row invite-form" onSubmit={(event) => void sendInvitation(event)}>
                      <label className="field"><span>Invite by email</span><input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" placeholder="teammate@example.com" required /></label>
                      <label className="field"><span>Role</span>
                        <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                          <option value="MEMBER">Member</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </label>
                      <button className="button button-primary" type="submit" disabled={inviteBusy}><UserPlus size={15} /> {inviteBusy ? "Inviting…" : "Invite"}</button>
                    </form>
                  </section>
                </>
              ) : teamLoadError ? null : team === null && teamManageable ? (
                <section className="settings-group"><SkeletonRowsFallback /></section>
              ) : (
                <section className="settings-group"><p className="settings-row muted">Only workspace owners and admins can manage the team.</p></section>
              )}
            </section>
          )}

          {section === "billing" && (
            <section className="settings-section settings-billing" aria-label="Billing">
              <BillingSettings />
            </section>
          )}

          {section === "policies" && (
            <section className="settings-section" aria-labelledby="policies-title">
              <header className="settings-section-head">
                <h2 id="policies-title">Policies & support</h2>
                <p>Find help, understand how {PRODUCT_NAME} uses data, and review the rules that protect your workspace.</p>
              </header>
              <section className="settings-group review-links" aria-label="Policies and support">
                <ul className="settings-rows settings-link-list">
                  {[
                    ["Support", "/support", "Contact the team and get setup help"],
                    ["Terms of service", "/terms", "The agreement for using the product"],
                    ["Privacy policy", "/privacy", "What we collect and why"],
                    ["Cookies", "/cookies", "How cookies are used on the site"],
                    ["Acceptable use", "/acceptable-use", "What automations may and may not do"],
                    ["Data processing", "/data-processing", "How customer data is processed"],
                    ["Service providers", "/service-providers", "Third parties that help run the service"],
                    ["Data deletion", "/data-deletion", "How to remove your data"],
                  ].map(([label, href, hint]) => (
                    <li key={href}>
                      <Link className="settings-row settings-link-row" href={href}>
                        <span className="settings-row-copy"><strong>{label}</strong><small>{hint}</small></span>
                        <ChevronRight size={16} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonRowsFallback() {
  return (
    <div className="settings-rows" aria-busy="true" aria-label="Loading team">
      {[0, 1].map((index) => (
        <div className="settings-row" key={index}><Skeleton className="skeleton-word skeleton-row-title" /></div>
      ))}
    </div>
  );
}
