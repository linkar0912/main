"use client";

import { slidingThumbRef } from "@/src/components/ui/use-sliding-thumb";
import { Presence, PresenceSlot, prefersReducedMotion, presenceProps } from "@/src/components/ui/use-presence";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Plus,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  LockKeyhole,
  Plug,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BillingSettings } from "./billing-settings";
import { ContextHelpLink } from "./context-help-link";
import { CopyDiagnosticsButton } from "./copy-diagnostics-button";
import { InlineConfirm } from "./inline-confirm";
import { InstagramGlyph } from "./instagram-glyph";
import { FacebookGlyph } from "./facebook-glyph";
import { SocialAvatar } from "./social-avatar";
import { Collapse } from "./ui/collapse";
import { RelativeTime } from "./ui/relative-time";
import { StatusBadge, type StatusTone } from "./ui/status-badge";
import { StatusSummary } from "./ui/status-summary";
import { PrefsGroupHead, PrefsRow, PrefsSectionHead } from "./settings/prefs";
import type { ConnectionStatus } from "@/src/lib/repository";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { parsePlanIntent } from "@/src/lib/billing/plan-intent";
import { formatDate } from "@/src/lib/format-date";
import { toReadableApiError } from "@/src/lib/api-error-message";
import { Skeleton } from "./skeleton";
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

/** One status word per account: the record's state, then what the health check found. */
function accountStatus(status: ConnectionStatus, health?: { checkError?: string; missingFields: string[] }): { tone: StatusTone; label: string } {
  if (status === "EXPIRED") return { tone: "danger", label: "Expired" };
  if (status === "DISCONNECTED") return { tone: "danger", label: "Disconnected" };
  if (health?.checkError) return { tone: "warning", label: "Not checked" };
  if (health && health.missingFields.length > 0) return { tone: "warning", label: "Needs reconnect" };
  return { tone: "success", label: "Connected" };
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

const SETTINGS_SECTIONS = ["connections", "delivery", "billing", "team", "policies", "security"] as const;

/** One line per section for the phone drill-in list (hidden on wider screens). */
const SECTION_HINTS: Record<(typeof SETTINGS_SECTIONS)[number], string> = {
  connections: "Instagram accounts and Facebook Pages",
  delivery: "Quiet hours and safeguards",
  team: "Members and invitations",
  billing: "Plan, usage and invite codes",
  policies: "Support, terms and privacy",
  security: "Password and sign-in",
};

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
  // /settings in the app; the dev preview mounts the same screen elsewhere.
  const settingsPath = usePathname() || "/settings";
  const [connections, setConnections] = useState<Connection[]>([]);
  // One entry per connected account, matched by id at render time - a
  // workspace with more than one connected Instagram account or Facebook Page
  // previously only ever saw health for whichever the API happened to list
  // first (`data?.[0]`), silently hiding the others' status entirely.
  const [health, setHealth] = useState<ConnectionHealth[]>([]);
  const [mode, setMode] = useState<"demo" | "configured">("demo");
  // Marks the signed-in person's own row in Team.
  const [viewerEmail, setViewerEmail] = useState("");
  // useSearchParams (not a window.location initializer) so the server and the
  // first client render agree on this value - no hydration mismatch to fix up.
  const searchParams = useSearchParams();
  const metaState = searchParams.get("meta") ?? "";
  const facebookState = searchParams.get("facebook") ?? "";
  // ?account=<connection id> (the sidebar's Accounts list) outlines that row
  // in Connections and scrolls it into view.
  const focusedAccountId = searchParams.get("account") ?? "";
  // ?plan=&interval= (a plan picked on /pricing) pre-selects it in Billing.
  const billingPreselect = parsePlanIntent(searchParams.get("plan"), searchParams.get("interval"));
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
    router.push(`${settingsPath}?section=${next}`, { scroll: false });
  };
  // Phones drill in: a bare /settings is the list of sections, and a section
  // (or an OAuth return / a sidebar account link) is a page of its own.
  const showsSection = Boolean(picked) || SETTINGS_SECTIONS.includes(requestedSection as SettingsSection)
    || Boolean(focusedAccountId || metaState || facebookState);
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
  // Role changes: the member whose change is in flight, and the one that
  // just saved (a quiet "Saved" beside the select that leaves on its own).
  const [roleSavingId, setRoleSavingId] = useState("");
  const [roleSavedId, setRoleSavedId] = useState("");
  const roleSavedTimerRef = useRef<number | undefined>(undefined);
  const [teamLoadError, setTeamLoadError] = useState("");
  // Bumped by Retry after the team failed to load.
  const [teamReload, setTeamReload] = useState(0);
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
    if (!focusedAccountId || connectionsLoading || section !== "connections") return;
    const row = document.getElementById(`account-${focusedAccountId}`);
    row?.scrollIntoView?.({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [focusedAccountId, connectionsLoading, section]);

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

  function discardQuietHours() {
    setQuietEnabled(quietPersisted.enabled);
    setQuietStart(quietPersisted.start);
    setQuietEnd(quietPersisted.end);
    setQuietTz(quietPersisted.timezone);
    setQuietError("");
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
      setViewerEmail(bootstrap?.email ?? "");
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
    // Billing shows the team seats in use, so it reads the (cached) team too;
    // a failure there only leaves that one meter out.
    if (section !== "team" && section !== "billing") return;
    const quiet = section === "billing";
    const controller = new AbortController();
    void getTeamOverview(controller.signal).then(setTeam).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      if ((reason as { status?: number })?.status === 403) {
        setTeamManageable(false);
        return;
      }
      if (quiet) return;
      setTeamLoadError("Could not load team settings. Check your connection and try again.");
    });
    return () => controller.abort();
  }, [section, teamReload]);

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

  useEffect(() => () => window.clearTimeout(roleSavedTimerRef.current), []);

  /** Optimistic: the select shows the new role at once and rolls back if the server says no. */
  async function changeMemberRole(memberId: string, email: string, role: "ADMIN" | "MEMBER") {
    if (roleSavingId) return;
    const before = team?.members.find((member) => member.id === memberId)?.role;
    if (!before || before === role) return;
    const applyRole = (next: string) => setTeam((current) => current ? {
      ...current,
      members: current.members.map((member) => member.id === memberId ? { ...member, role: next } : member),
    } : current);
    applyRole(role);
    setRoleSavingId(memberId);
    setRoleSavedId("");
    setTeamError("");
    setTeamNotice("");
    try {
      const response = await fetch(`/api/team/members/${encodeURIComponent(memberId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(roleErrorMessage(payload?.error, email));
      }
      // Billing's seat meter and other readers pick the change up next time.
      invalidateWorkspaceResource("team-overview");
      window.clearTimeout(roleSavedTimerRef.current);
      setRoleSavedId(memberId);
      roleSavedTimerRef.current = window.setTimeout(() => setRoleSavedId(""), 2_400);
    } catch (error) {
      applyRole(before);
      setTeamError(error instanceof Error ? error.message : `Could not change the role for ${email}.`);
    } finally {
      setRoleSavingId("");
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

  const navGroups: Array<{ label: string; items: Array<{ key: SettingsSection; label: string; icon: typeof Plug; count?: number }> }> = [
    {
      label: "Workspace",
      items: [
        { key: "connections", label: "Connections", icon: Plug, count: connectionsLoading || connectionsLoadError ? undefined : connections.length + facebookPages.length },
        { key: "delivery", label: "Delivery", icon: Clock },
        { key: "team", label: "Team", icon: Users, count: team ? sectionCounts.team : undefined },
      ],
    },
    {
      label: "Account",
      items: [
        { key: "billing", label: "Billing", icon: CreditCard },
        { key: "policies", label: "Policies", icon: FileText },
        { key: "security", label: "Security", icon: LockKeyhole },
      ],
    },
  ];

  const timeOptions = Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>);
  const quietDirty = !sameQuietHours({ enabled: quietEnabled, start: quietStart, end: quietEnd, timezone: quietTz }, quietPersisted);
  const hour = (value: number) => `${String(value).padStart(2, "0")}:00`;
  // Phones only: the way back to the list of sections.
  const back = <Link className="prefs-back" href={settingsPath}><ChevronLeft size={16} aria-hidden="true" /> Settings</Link>;
  const statusLoading = connectionsLoading ? <Skeleton className="skeleton-word skeleton-row-meta" /> : null;

  return (
    <div className="page-wrap settings-wrap prefs ws-page" data-view={showsSection ? "section" : "index"}>
      <PageHeader
        title="Settings"
        description="Channels, delivery, team and billing for this workspace."
        help={<ContextHelpLink topic="connecting-instagram" />}
      />

      {metaState && <div className={`notice-banner ${metaState === "connected" ? "notice-success" : "notice-warning"}`} role="status">{metaState === "connected" ? <Check size={17} /> : <AlertCircle size={17} />}<p>{statusMessage[metaState] ?? "Connection status updated."}</p></div>}
      {facebookState && <div className={`notice-banner ${facebookState === "connected" || facebookState === "select-page" ? "notice-success" : "notice-warning"}`} role="status">{facebookState === "connected" ? <Check size={17} /> : facebookState === "select-page" ? <Info size={17} /> : <AlertCircle size={17} />}<p>{facebookStatusMessage[facebookState] ?? "Facebook connection status updated."}</p></div>}

      <div className="prefs-shell">
        {/* The selected section sits on a white tile that glides between items
            (useSlidingThumb positions .prefs-nav-tile). */}
        <nav ref={slidingThumbRef} className="prefs-nav" aria-label="Settings sections">
          <span className="prefs-nav-tile" aria-hidden="true" />
          {navGroups.map((group) => (
            <div className="prefs-nav-group" key={group.label}>
              <span className="prefs-nav-label">{group.label}</span>
              {group.items.map(({ key, label, icon: Icon, count }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={section === key}
                  className={`prefs-nav-item${section === key ? " is-active" : ""}`}
                  onClick={() => setSection(key)}
                >
                  <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
                  <span className="prefs-nav-text">
                    <span className="prefs-nav-name">{label}</span>
                    <span className="prefs-nav-hint">{SECTION_HINTS[key]}</span>
                  </span>
                  {count !== undefined ? <span className="prefs-nav-count">{count}</span> : null}
                  <ChevronRight className="prefs-nav-chevron" size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="prefs-main" key={section}>
          {section === "connections" && (
            <section className="prefs-section" aria-labelledby="connections-title">
              <PrefsSectionHead id="connections-title" title="Connections" description="The Instagram accounts and Facebook Pages your automations reply from." back={back} />

              {connectionsLoadError && (
                <div className="notice-banner notice-warning settings-load-error" role="alert">
                  <AlertCircle size={17} />
                  <p>{connectionsLoadError}</p>
                  <button className="button button-secondary button-small" type="button" onClick={() => void loadConnectionsData()}>Retry</button>
                </div>
              )}

              {/* After a failed load the counts below would read as "nothing is
                  connected", so they stay hidden until a load succeeds. */}
              {connectionsLoadError ? null : <>
              <section className="prefs-status" aria-label="Workspace status">
                <span className="prefs-status-item" role="group" aria-label="Mode status">
                  {statusLoading ?? <><span className="prefs-dot" data-tone={mode === "demo" ? "warning" : "ok"} aria-hidden="true" />{mode === "demo" ? "Demo mode" : "Live"}</>}
                </span>
                <span className="prefs-status-item" role="group" aria-label="Channel status">
                  {statusLoading ?? (connectedChannelCount === 0 ? "No channels connected" : `${connectedChannelCount} ${connectedChannelCount === 1 ? "channel" : "channels"} connected`)}
                </span>
                <span className="prefs-status-item" role="group" aria-label="Incoming messages status">
                  {statusLoading ?? <>
                    <span className="prefs-dot" data-tone={webhookState === "ok" ? "ok" : webhookState === "warn" ? "warning" : "idle"} aria-hidden="true" />
                    {webhookState === "ok" ? "Incoming messages healthy" : webhookState === "warn" ? "Incoming messages need attention" : webhookState === "checking" ? "Checking incoming messages…" : "Incoming messages not set up yet"}
                  </>}
                </span>
              </section>

              {connectionsLoading ? (
                <div className="prefs-group">
                  <div className="prefs-card" aria-busy="true" aria-label="Loading connections">
                    {[0, 1].map((index) => (
                      <div className="prefs-row" key={index}>
                        <Skeleton className="skeleton-avatar" />
                        <div className="prefs-row-copy"><Skeleton className="skeleton-word skeleton-row-title" /><Skeleton className="skeleton-word skeleton-row-meta" /></div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <section className="prefs-group" data-channel-card="instagram" aria-labelledby="instagram-group-title">
                    <PrefsGroupHead
                      id="instagram-group-title"
                      title={<><InstagramGlyph size={18} brand /> Instagram</>}
                      description={connections.length > 0 ? `${connections.length} ${connections.length === 1 ? "account" : "accounts"} replying to comments and direct messages` : undefined}
                      action={connections.length > 0 ? <a className="button button-secondary button-small" href="/api/meta/oauth/start"><Plus size={14} aria-hidden="true" /> Connect another account</a> : null}
                    />
                    <div className="prefs-card">
                      {connections.length === 0 ? (
                        <div className="prefs-row prefs-empty">
                          <div className="prefs-row-copy">
                            <strong id="instagram-channel-title">No account connected</strong>
                            <small>Connect an Instagram professional account to start replying to comments and messages with {PRODUCT_NAME}.</small>
                          </div>
                          <div className="prefs-row-control">
                            <a className="button button-primary button-small" href="/api/meta/oauth/start">Connect Instagram <ExternalLink size={13} aria-hidden="true" /></a>
                          </div>
                        </div>
                      ) : (
                        <ul className="prefs-list">
                          {connections.map((connection) => {
                            const accountHealth = health.find((entry) => entry.id === connection.id);
                            return (
                              <AccountRow
                                key={connection.id}
                                id={connection.id}
                                channel="instagram"
                                name={`@${connection.username}`}
                                avatarUrl={connection.profilePictureUrl ?? undefined}
                                description={<>Instagram account, connected {formatDate(connection.connectedAt)}</>}
                                idTitle={`Instagram account ID ${connection.igUserId}`}
                                status={connection.status}
                                health={accountHealth ? {
                                  checkError: accountHealth.checkError,
                                  missingFields: accountHealth.missingFields,
                                  fields: accountHealth.requiredFields.map((field) => ({ label: WEBHOOK_FIELD_LABELS[field] ?? field, live: !accountHealth.missingFields.includes(field) })),
                                } : undefined}
                                healthLabel={connections.length > 1 ? `Connection check for @${connection.username}` : "Connection check"}
                                reconnectHref="/api/meta/oauth/start"
                                reconnectHint="Reconnect Instagram to refresh the subscription."
                                focused={focusedAccountId === connection.id}
                                busy={disconnectingId === connection.id}
                                confirming={confirmingDisconnect?.channel === "instagram" && confirmingDisconnect.id === connection.id}
                                onAskDisconnect={() => setConfirmingDisconnect({ channel: "instagram", id: connection.id })}
                                confirm={
                                  <InlineConfirm
                                    label={`Confirm disconnecting @${connection.username}`}
                                    message={<>Disconnect <strong>@{connection.username}</strong>? Every automation on this account stops replying to comments and messages until you connect it again.</>}
                                    confirmLabel={`Disconnect @${connection.username}`}
                                    busyLabel="Disconnecting…"
                                    busy={disconnectingId === connection.id}
                                    onConfirm={() => void disconnect(connection.id)}
                                    onCancel={() => setConfirmingDisconnect(null)}
                                  />
                                }
                              />
                            );
                          })}
                        </ul>
                      )}
                    </div>
                    {disconnectError && <p className="form-error prefs-group-error" role="alert">{disconnectError}</p>}
                  </section>

                  <section className="prefs-group" data-channel-card="facebook" aria-labelledby="facebook-group-title">
                    <PrefsGroupHead
                      id="facebook-group-title"
                      title={<><FacebookGlyph size={18} brand /> Facebook Pages</>}
                      description={facebookPages.length > 0 ? `${facebookPages.length} ${facebookPages.length === 1 ? "Page" : "Pages"} replying to public comments` : undefined}
                      action={facebookPages.length > 0 ? <a className="button button-secondary button-small" href="/api/facebook/oauth/start"><Plus size={14} aria-hidden="true" /> Connect another Page</a> : null}
                    />
                    <div className="prefs-card">
                      {facebookState === "select-page" && (
                        <div className="prefs-row prefs-page-picker">
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
                      {facebookPages.length === 0 ? (
                        <div className="prefs-row prefs-empty">
                          <div className="prefs-row-copy">
                            <strong id="facebook-channel-title">No Page connected</strong>
                            <small>Connect a Facebook Page to auto-reply to comments on its public posts.</small>
                          </div>
                          <div className="prefs-row-control">
                            <a className="button button-primary button-small" href="/api/facebook/oauth/start">Connect a Facebook Page <ExternalLink size={13} aria-hidden="true" /></a>
                          </div>
                        </div>
                      ) : (
                        <ul className="prefs-list">
                          {facebookPages.map((page) => {
                            const pageHealth = facebookHealth.find((entry) => entry.id === page.id);
                            return (
                              <AccountRow
                                key={page.id}
                                id={page.id}
                                channel="facebook"
                                name={page.pageName}
                                avatarUrl={page.avatarUrl}
                                description={<>Facebook Page, connected {formatDate(page.connectedAt)}</>}
                                idTitle={`Facebook Page ID ${page.pageId}`}
                                status={page.status}
                                health={pageHealth ? {
                                  checkError: pageHealth.checkError,
                                  missingFields: pageHealth.missingFields,
                                  fields: [{ label: "Feed (Page posts + comments)", live: !pageHealth.missingFields.includes("feed") }],
                                } : undefined}
                                healthLabel={facebookPages.length > 1 ? `Facebook connection check for ${page.pageName}` : "Facebook connection check"}
                                reconnectHref="/api/facebook/oauth/start"
                                reconnectHint="Reconnect the Page to refresh the subscription."
                                focused={focusedAccountId === page.id}
                                busy={facebookBusyId === page.id}
                                confirming={confirmingDisconnect?.channel === "facebook" && confirmingDisconnect.id === page.id}
                                onAskDisconnect={() => setConfirmingDisconnect({ channel: "facebook", id: page.id })}
                                confirm={
                                  <InlineConfirm
                                    label={`Confirm disconnecting ${page.pageName}`}
                                    message={<>Disconnect <strong>{page.pageName}</strong>? Every automation on this Page stops replying to comments until you connect it again.</>}
                                    confirmLabel={`Disconnect ${page.pageName}`}
                                    busyLabel="Disconnecting…"
                                    busy={facebookBusyId === page.id}
                                    onConfirm={() => void disconnectFacebook(page.id)}
                                    onCancel={() => setConfirmingDisconnect(null)}
                                  />
                                }
                              />
                            );
                          })}
                        </ul>
                      )}
                    </div>
                    {facebookError && <p className="form-error prefs-group-error" role="alert">{facebookError}</p>}
                  </section>

                  {connectedChannelCount > 0 ? (
                    <section className="prefs-group" aria-labelledby="troubleshooting-title">
                      <PrefsGroupHead id="troubleshooting-title" title="Troubleshooting" />
                      <div className="prefs-card">
                        <PrefsRow label="Details for support" helper="Copies connection health and recent failed deliveries, without any message text, so support can see what went wrong.">
                          <CopyDiagnosticsButton />
                        </PrefsRow>
                      </div>
                    </section>
                  ) : null}
                </>
              )}
              </>}
            </section>
          )}

          {section === "delivery" && (
            <section className="prefs-section" aria-labelledby="delivery-title">
              <PrefsSectionHead id="delivery-title" title="Delivery" description="When automated messages may go out, and the safeguards that always apply." back={back} />

              <section className="prefs-group" aria-label="Messaging hours">
                <PrefsGroupHead title="Quiet hours" description="Sequences and broadcasts hold their DMs during this window. Replies to someone’s own message are never delayed." />
                <div className="prefs-card">
                  <PrefsRow
                    className="prefs-row-switch"
                    label="Hold automated DMs during quiet hours"
                    helper={(
                      <span className="delivery-status" data-enabled={quietEnabled} data-unsaved={quietDirty || undefined}>
                        {quietDirty
                          ? quietEnabled ? "Quiet hours on, not saved yet" : "Quiet hours off, not saved yet"
                          : quietEnabled ? "Quiet hours enabled" : "Quiet hours disabled"}
                      </span>
                    )}
                  >
                    <label className="settings-switch">
                      <input type="checkbox" role="switch" aria-label="Hold automated DMs during quiet hours" checked={quietEnabled} onChange={(event) => setQuietEnabled(event.target.checked)} />
                      <span aria-hidden="true" />
                    </label>
                  </PrefsRow>
                  <PrefsRow
                    label="Quiet window"
                    helper={quietEnabled ? `DMs queued between ${hour(quietStart)} and ${hour(quietEnd)} go out at ${hour(quietEnd)}.` : "Messages queued in this window go out when it ends."}
                    disabled={!quietEnabled}
                  >
                    <div className="prefs-fields">
                      <label className="field">
                        <span>Start time</span>
                        <select value={String(quietStart)} disabled={!quietEnabled} onChange={(e) => setQuietStart(Number(e.target.value))}>{timeOptions}</select>
                      </label>
                      <label className="field">
                        <span>End time</span>
                        <select value={String(quietEnd)} disabled={!quietEnabled} onChange={(e) => setQuietEnd(Number(e.target.value))}>{timeOptions}</select>
                      </label>
                    </div>
                  </PrefsRow>
                  <PrefsRow label="Timezone" helper="The quiet window follows this clock." disabled={!quietEnabled}>
                    <label className="field prefs-field-wide">
                      <span className="sr-only">Workspace timezone</span>
                      <select aria-label="Workspace timezone" value={quietTz} disabled={!quietEnabled} onChange={(e) => setQuietTz(e.target.value)}>
                        {timeZoneOptions(quietTz).map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
                      </select>
                    </label>
                  </PrefsRow>
                </div>
                {quietError && <p className="form-error prefs-group-error" role="alert">{quietError}</p>}
              </section>

              <aside className="prefs-group" aria-label="Delivery safeguards">
                <PrefsGroupHead title="Safeguards" description="Always on. They can’t be switched off." />
                <div className="prefs-card">
                  <div className="prefs-row prefs-safeguards">
                    <StatusSummary label="4 safeguards always on">
                      <ul className="check-list">
                        <li><Check size={16} aria-hidden="true" /> Connection details are stored securely.</li>
                        <li><Check size={16} aria-hidden="true" /> Updates from connected apps are checked before use.</li>
                        <li><Check size={16} aria-hidden="true" /> Repeated updates are ignored safely.</li>
                        <li><Check size={16} aria-hidden="true" /> Replies follow only the rules you save.</li>
                      </ul>
                    </StatusSummary>
                  </div>
                  <PrefsRow
                    label={<><span className="prefs-dot" data-tone={mode === "demo" ? "warning" : "ok"} aria-hidden="true" /> {mode === "demo" ? "Demo mode" : "Live"}</>}
                    helper={mode === "demo" ? "Live delivery isn't set up for this workspace yet, so it runs on sample data." : "This workspace delivers live replies through Instagram and Facebook."}
                  >
                    <Link className="text-link" href="/support">Setup guidance <ExternalLink size={13} aria-hidden="true" /></Link>
                  </PrefsRow>
                </div>
              </aside>

              {/* Only while quiet hours have edits that are not saved yet. */}
              <Presence>
                {quietDirty || quietSaved ? (
                  <PresenceSlot>
                    {(state) => (
                      <div className="prefs-savebar" role="region" aria-label="Unsaved quiet hours" {...presenceProps(state)}>
                        {quietDirty ? (
                          <>
                            <span className="prefs-savebar-state"><span className="prefs-dot" data-tone="warning" aria-hidden="true" /> Unsaved changes</span>
                            <div className="prefs-savebar-actions">
                              <button className="button button-secondary button-small" type="button" disabled={quietBusy} onClick={discardQuietHours}>Discard</button>
                              <button className="button button-primary button-small" type="button" disabled={quietBusy} onClick={() => void saveMessagingWindow(quietEnabled)}>
                                {quietBusy ? "Saving…" : "Save changes"}
                              </button>
                            </div>
                          </>
                        ) : (
                          <span className="form-success" role="status"><Check size={15} /> Saved.</span>
                        )}
                      </div>
                    )}
                  </PresenceSlot>
                ) : null}
              </Presence>
            </section>
          )}

          {section === "team" && (
            <section className="prefs-section" aria-labelledby="team-title">
              <PrefsSectionHead id="team-title" title="Team" description="Who can work in this workspace, and who has been invited." back={back} />
              {teamNotice && <p className="form-success prefs-notice" role="status"><Check size={15} /> {teamNotice}</p>}
              {teamError && <p className="form-error prefs-notice" role="alert">{teamError}</p>}
              {teamLoadError && (
                <div className="notice-banner notice-warning settings-load-error" role="alert">
                  <AlertCircle size={17} />
                  <p>{teamLoadError}</p>
                  <button className="button button-secondary button-small" type="button" onClick={() => { setTeamLoadError(""); setTeamReload((count) => count + 1); }}>Retry</button>
                </div>
              )}
              {teamManageable && team ? (
                <>
                  <section className="prefs-group" aria-label="Invite a teammate">
                    <PrefsGroupHead title="Invite a teammate" description="They get an email with a link to join. Invitations expire after 7 days and must be accepted with the invited email address." />
                    <form className="prefs-card prefs-invite" onSubmit={(event) => void sendInvitation(event)}>
                      <label className="field prefs-invite-email"><span>Email address</span><input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" inputMode="email" autoComplete="off" spellCheck={false} placeholder="teammate@example.com" required /></label>
                      <label className="field prefs-invite-role"><span>Role</span>
                        <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                          <option value="MEMBER">Member</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </label>
                      <button className="button button-primary" type="submit" disabled={inviteBusy}><UserPlus size={15} aria-hidden="true" /> {inviteBusy ? "Inviting…" : "Send invite"}</button>
                    </form>
                  </section>

                  <section className="prefs-group" aria-labelledby="members-title">
                    <PrefsGroupHead id="members-title" title="Members" count={team.members.length} description="Admins can connect accounts and invite people. Members can build and run automations." />
                    <ul className="prefs-card prefs-list">
                      {team.members.map((member) => {
                        const isViewer = Boolean(viewerEmail) && viewerEmail.toLowerCase() === member.email.toLowerCase();
                        // Your own row and the owner's never change here.
                        const memberId = member.id;
                        const editable = Boolean(memberId) && Boolean(viewerEmail) && !isViewer && member.role !== "OWNER";
                        return (
                          <li className="prefs-row prefs-person" key={member.email}>
                            <span className="prefs-person-who">
                              <span className="avatar avatar-small" aria-hidden="true">{member.email.slice(0, 2).toUpperCase()}</span>
                              <span className="prefs-person-copy">
                                <strong>{member.email}</strong>
                                {isViewer ? <small>You</small> : null}
                              </span>
                            </span>
                            {editable && memberId ? (
                              <span className="prefs-person-role-edit">
                                {roleSavedId === memberId ? <span className="prefs-role-saved" role="status"><Check size={14} aria-hidden="true" /> Saved</span> : null}
                                <label className="field prefs-person-role-field">
                                  <span className="sr-only">Role for {member.email}</span>
                                  <select
                                    value={member.role}
                                    disabled={roleSavingId === memberId}
                                    aria-busy={roleSavingId === memberId || undefined}
                                    onChange={(event) => void changeMemberRole(memberId, member.email, event.target.value === "ADMIN" ? "ADMIN" : "MEMBER")}
                                  >
                                    <option value="ADMIN">Admin</option>
                                    <option value="MEMBER">Member</option>
                                  </select>
                                </label>
                              </span>
                            ) : (
                              <span className="prefs-person-role">{roleLabel(member.role)}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  {team.invitations.length > 0 ? (
                    <section className="prefs-group" aria-labelledby="invitations-title">
                      <PrefsGroupHead id="invitations-title" title="Pending invitations" count={team.invitations.length} description="Pending invitations count toward your plan’s team seats." />
                      <ul className="prefs-card prefs-list">
                        {team.invitations.map((invitation) => (
                          <li className="prefs-row prefs-person" key={invitation.id}>
                            <span className="prefs-person-who">
                              <span className="avatar avatar-small is-pending" aria-hidden="true">{invitation.email.slice(0, 2).toUpperCase()}</span>
                              <span className="prefs-person-copy"><strong>{invitation.email}</strong><small>{roleLabel(invitation.role)}, invite expires <RelativeTime value={invitation.expiresAt} inline /></small></span>
                            </span>
                            <button
                              className="button button-ghost button-small prefs-danger-text"
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
                  ) : null}
                </>
              ) : teamLoadError ? null : team === null && teamManageable ? (
                <div className="prefs-group"><SkeletonRowsFallback /></div>
              ) : (
                <div className="prefs-group">
                  <div className="prefs-card">
                    <PrefsRow label="Only workspace owners and admins can manage the team." helper="Ask one of them to invite people to this workspace." />
                  </div>
                </div>
              )}
            </section>
          )}

          {section === "billing" && (
            <section className="prefs-section settings-billing" aria-label="Billing">
              <BillingSettings
                back={back}
                preselect={billingPreselect}
                usage={connectionsLoading || connectionsLoadError ? undefined : {
                  instagram: connections.length,
                  facebook: facebookPages.length,
                  seats: team ? sectionCounts.team : undefined,
                }}
              />
            </section>
          )}

          {section === "policies" && (
            <section className="prefs-section" aria-labelledby="policies-title">
              <PrefsSectionHead id="policies-title" title="Policies and support" description={`Get help, see how ${PRODUCT_NAME} uses data, and read the rules that protect your workspace.`} back={back} />
              <LinkGroup
                id="support-links-title"
                title="Support"
                links={[
                  ["Support", "/support", "Contact the team and get setup help"],
                  ["Help centre", "/help", "Step-by-step guides for every feature"],
                ]}
              />
              <LinkGroup
                id="policy-links-title"
                title="Policies"
                links={[
                  ["Terms of service", "/terms", "The agreement for using the product"],
                  ["Privacy policy", "/privacy", "What we collect and why"],
                  ["Cookies", "/cookies", "How cookies are used on the site"],
                  ["Acceptable use", "/acceptable-use", "What automations may and may not do"],
                  ["Data processing", "/data-processing", "How customer data is processed"],
                  ["Service providers", "/service-providers", "Third parties that help run the service"],
                  ["Data deletion", "/data-deletion", "How to remove your data"],
                ]}
              />
            </section>
          )}

          {section === "security" && (
            <section className="prefs-section" aria-labelledby="security-title">
              <PrefsSectionHead id="security-title" title="Security" description="How you sign in, and where you are signed in." back={back} />
              <section className="prefs-group" aria-labelledby="sign-in-title">
                <PrefsGroupHead id="sign-in-title" title="Sign-in" description="Password and sessions are managed on your profile." />
                <div className="prefs-card">
                  <PrefsRow label="Password" helper="Change the password you use to sign in.">
                    <Link className="button button-secondary button-small" href="/profile">Change password</Link>
                  </PrefsRow>
                  <PrefsRow label="Signed-in devices" helper="Sign out on every device at once, including this one.">
                    <Link className="button button-secondary button-small" href="/profile">Manage sessions</Link>
                  </PrefsRow>
                </div>
              </section>
              <LinkGroup
                id="account-links-title"
                title="Your account"
                links={[
                  ["Profile", "/profile", "Your email, verification and connected channels"],
                  ["Delete your data", "/data-deletion", "How to remove your account and workspace data"],
                ]}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

/** A sentence for a refused role change (PATCH /api/team/members/:id). */
function roleErrorMessage(code: string | undefined, email: string): string {
  switch (code) {
    case "cannot_change_owner":
      return "The workspace owner’s role can’t be changed.";
    case "cannot_change_own_role":
      return "You can’t change your own role. Ask another owner or admin.";
    case "forbidden":
      return "Only workspace owners and admins can change roles.";
    case "not_found":
      return `${email} is no longer in this workspace. Reload to see the current team.`;
    default:
      return `Could not change the role for ${email}. Try again in a moment.`;
  }
}

/** A group of chevron rows that each open another page. */
function LinkGroup({ id, title, links }: { id: string; title: string; links: Array<[label: string, href: string, hint: string]> }) {
  return (
    <section className="prefs-group" aria-labelledby={id}>
      <PrefsGroupHead id={id} title={title} />
      <ul className="prefs-card prefs-list">
        {links.map(([label, href, hint]) => (
          <li key={href}>
            <Link className="prefs-row prefs-link-row" href={href}>
              <span className="prefs-row-copy"><strong>{label}</strong><small>{hint}</small></span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

type AccountHealthView = { checkError?: string; missingFields: string[]; fields: Array<{ label: string; live: boolean }> };

/**
 * One connected Instagram account or Facebook Page: who it is, one status
 * word, Reconnect / Disconnect, and the subscription check behind a
 * disclosure (open from the start when something needs a reconnect).
 */
function AccountRow({
  id, channel, name, avatarUrl, description, idTitle, status, health, healthLabel, reconnectHref, reconnectHint,
  focused, busy, confirming, onAskDisconnect, confirm,
}: {
  id: string;
  channel: "instagram" | "facebook";
  name: string;
  avatarUrl?: string;
  description: ReactNode;
  idTitle: string;
  status: ConnectionStatus;
  health?: AccountHealthView;
  healthLabel: string;
  reconnectHref: string;
  reconnectHint: string;
  focused: boolean;
  busy: boolean;
  confirming: boolean;
  onAskDisconnect: () => void;
  confirm: ReactNode;
}) {
  const detailId = useId();
  const problem = Boolean(health && (health.checkError || health.missingFields.length > 0)) || status !== "CONNECTED";
  // Health arrives after the row, so the default follows it until toggled.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? problem;
  const setOpen = (next: (current: boolean) => boolean) => setToggled(next(open));
  const healthState = health?.checkError ? "error" : health && health.missingFields.length === 0 ? "ok" : "warn";
  return (
    <li className={`prefs-account${focused ? " is-focused" : ""}`} id={`account-${id}`}>
      <div className="prefs-account-main">
        <SocialAvatar channel={channel} name={name} src={avatarUrl} />
        <div className="prefs-account-copy">
          <strong>{name}</strong>
          <small title={idTitle}>{description}</small>
        </div>
        <div className="prefs-account-actions">
          <StatusBadge {...accountStatus(status, health)} />
          <a className={`button ${problem ? "button-secondary" : "button-ghost"} button-small`} href={reconnectHref}>Reconnect</a>
          <button
            className="button button-ghost button-small prefs-danger-text"
            type="button"
            disabled={busy}
            aria-expanded={confirming}
            onClick={onAskDisconnect}
          >
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      </div>
      {confirming ? confirm : null}
      {health ? (
        <div className="prefs-account-health" role="group" data-channel-health={channel} data-state={healthState} aria-label={healthLabel}>
          <button className="prefs-health-toggle" type="button" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen((current) => !current)}>
            <span className="health-orb" data-state={healthState} aria-hidden="true" />
            <span>{health.missingFields.length > 0 ? "Some fields need a reconnect" : health.checkError ? "Could not check right now" : "All caught up"}</span>
            <ChevronDown className="prefs-health-chevron" size={14} aria-hidden="true" />
          </button>
          {health.checkError || health.missingFields.length > 0 ? (
            <p className="prefs-health-note">
              {health.checkError ? `Meta said: ${health.checkError}. ` : ""}{reconnectHint}
            </p>
          ) : null}
          <Collapse open={open} id={detailId}>
            {open && (
              <ul className="prefs-health-fields" aria-label="Updates this account sends">
                {health.fields.map((field) => (
                  <li key={field.label} data-live={field.live}>
                    {field.live ? <Check size={14} aria-hidden="true" /> : <AlertCircle size={14} aria-hidden="true" />}
                    {field.label}
                  </li>
                ))}
              </ul>
            )}
          </Collapse>
        </div>
      ) : null}
    </li>
  );
}

function SkeletonRowsFallback() {
  return (
    <div className="prefs-card" aria-busy="true" aria-label="Loading team">
      {[0, 1].map((index) => (
        <div className="prefs-row" key={index}><Skeleton className="skeleton-word skeleton-row-title" /></div>
      ))}
    </div>
  );
}
