"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Copy, Download, History, Pencil, Trash2 } from "lucide-react";
import { AutomationOverflowMenu, type OverflowMenuItem } from "./automation-overflow-menu";
import { AutomationVersionsModal } from "./automation-versions-modal";
import { FacebookGlyph } from "./facebook-glyph";
import { InstagramGlyph } from "./instagram-glyph";
import { clearAutomationsCache, removeAutomationFromCache, syncAutomationInCache } from "./automation-list";
import { Presence } from "./ui/use-presence";
import { RelativeTime } from "./ui/relative-time";
import { StatusBadge, type StatusTone } from "./ui/status-badge";
import { slidingThumbRef } from "./ui/use-sliding-thumb";
import type { AutomationRecord, AutomationStatus } from "@/src/lib/repository";
import { isFacebookAutomation } from "@/src/lib/automation-attention";
import { toReadableApiError } from "@/src/lib/api-error-message";

export type AutomationDetailTab = "overview" | "activity" | "edit";

/** Status in the words the Automations tabs use: Live, Paused, Draft. */
export const AUTOMATION_STATUS_LABEL: Record<AutomationStatus, [StatusTone, string]> = {
  ACTIVE: ["success", "Live"],
  PAUSED: ["neutral", "Paused"],
  DRAFT: ["neutral", "Draft"],
};

export function detailTabFor(pathname: string): AutomationDetailTab {
  if (/\/edit\/?$/.test(pathname)) return "edit";
  if (/\/activity\/?$/.test(pathname)) return "activity";
  return "overview";
}

/** Comment-to-link campaigns and Facebook Page replies keep a per-person activity log; classic DM rules don't. */
export function hasActivityLog(automation: Pick<AutomationRecord, "definition" | "provider" | "facebookPageId">): boolean {
  return automation.definition.version === 2 || isFacebookAutomation(automation);
}

/**
 * One header for an automation, shared by its Overview, Activity and Edit
 * tabs (the [id] route layout): channel, name, status with its switch, Edit
 * and a "…" menu, then the view tabs. It stays mounted while the tabs swap,
 * and re-reads the automation on each switch so a rename or status change
 * made in Edit shows up here.
 */
export function AutomationDetailFrame({ automationId, initialAutomation, basePath = "/automations", children }: {
  automationId: string;
  /** From the server layout; undefined when the lookup failed (the client fetch fills in). */
  initialAutomation?: AutomationRecord;
  /** Where automations live; the dev preview mounts them elsewhere. */
  basePath?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const tab = detailTabFor(pathname);
  const [automation, setAutomation] = useState<AutomationRecord | null>(initialAutomation ?? null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingTab, setPendingTab] = useState<{ tab: AutomationDetailTab; from: string } | null>(null);
  const skipFirstFetch = useRef(initialAutomation !== undefined);
  const shownTab = pendingTab && pendingTab.from === pathname ? pendingTab.tab : tab;
  const href = `${basePath}/${encodeURIComponent(automationId)}`;

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    const controller = new AbortController();
    fetch(`/api/automations/${encodeURIComponent(automationId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json().catch(() => ({}))) as { data?: AutomationRecord };
        if (payload.data) setAutomation(payload.data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [automationId, pathname]);

  async function setStatus(status: AutomationStatus) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      const response = await fetch(`/api/automations/${encodeURIComponent(automationId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: AutomationRecord; error?: string };
      // A refused activation (409) explains what to fix - surface it as-is.
      if (!response.ok || !payload.data) throw new Error(toReadableApiError(payload.error, "Could not update automation"));
      setAutomation(payload.data);
      syncAutomationInCache(payload.data);
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    setActionError("");
    try {
      const response = await fetch(`/api/automations/${encodeURIComponent(automationId)}/duplicate`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { data?: AutomationRecord; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not duplicate this automation.");
      clearAutomationsCache();
      router.push(`${basePath}/${payload.data.id}/edit`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not duplicate this automation.");
    }
  }

  async function remove() {
    setActionError("");
    try {
      const response = await fetch(`/api/automations/${encodeURIComponent(automationId)}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(toReadableApiError(payload.error, "Could not delete this automation."));
      }
      removeAutomationFromCache(automationId);
      router.push(basePath);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not delete this automation.");
    }
  }

  const name = automation?.name ?? "Automation";
  const facebook = automation ? isFacebookAutomation(automation) : false;
  const showActivity = (automation ? hasActivityLog(automation) : false) || tab === "activity";
  const [tone, statusLabel]: [StatusTone, string] = automation
    ? AUTOMATION_STATUS_LABEL[automation.status] ?? ["neutral", automation.status]
    : ["neutral", ""];
  const tabs: Array<{ key: AutomationDetailTab; label: string; href: string }> = [
    { key: "overview", label: "Overview", href },
    ...(showActivity ? [{ key: "activity" as const, label: "Activity", href: `${href}/activity` }] : []),
    { key: "edit", label: "Edit", href: `${href}/edit` },
  ];
  const menuItems: OverflowMenuItem[] = [
    { key: "duplicate", label: "Duplicate", icon: <Copy size={16} aria-hidden />, onSelect: () => void duplicate() },
    { key: "history", label: "Version history", icon: <History size={16} aria-hidden />, onSelect: () => setHistoryOpen(true) },
    {
      key: "delete",
      label: "Delete",
      icon: <Trash2 size={16} aria-hidden />,
      danger: true,
      ariaLabel: `Delete ${name}`,
      confirm: { label: "Confirm delete?", ariaLabel: `Confirm delete ${name}` },
      onSelect: () => void remove(),
    },
  ];

  return (
    <div className={`page-wrap ws-page automation-detail is-${tab}`}>
      <header className="page-header has-tabs auto-detail-header">
        <Link className="back-link" href={basePath}><ArrowLeft size={15} /> Automations</Link>
        <div className="page-header-row">
          <div className="auto-detail-identity">
            <span className={`auto-row-channel ${facebook ? "is-facebook" : "is-instagram"}`} aria-hidden>
              {facebook ? <FacebookGlyph size={20} brand /> : <InstagramGlyph size={20} brand />}
            </span>
            <div className="page-header-copy">
              <h1 title={name}>{name}</h1>
              {automation ? (
                <p className="auto-detail-meta">
                  {/* The switch beside the actions already says Live / Paused; the
                      badge covers Edit (no switch there) and drafts. */}
                  {tab === "edit" || automation.status === "DRAFT" ? <StatusBadge tone={tone} label={statusLabel} /> : null}
                  <span>{facebook ? "Facebook Page" : "Instagram"}</span>
                  <span>Edited <RelativeTime value={automation.updatedAt} inline /></span>
                </p>
              ) : null}
            </div>
          </div>
          <div className="header-actions auto-detail-actions">
            {automation && tab !== "edit" ? (
              automation.status === "DRAFT" ? (
                <button className="button button-secondary" type="button" disabled={busy} onClick={() => void setStatus("ACTIVE")}>Turn on</button>
              ) : (
                <button
                  className="status-switch auto-detail-switch"
                  type="button"
                  data-state={automation.status.toLowerCase()}
                  aria-pressed={automation.status === "ACTIVE"}
                  disabled={busy}
                  aria-label={automation.status === "ACTIVE" ? `Pause ${name}` : `Turn on ${name}`}
                  onClick={() => void setStatus(automation.status === "ACTIVE" ? "PAUSED" : "ACTIVE")}
                >
                  <span className="status-switch-track" aria-hidden><span /></span>
                  <span className="status-switch-label">{automation.status === "ACTIVE" ? "Live" : "Paused"}</span>
                </button>
              )
            ) : null}
            {tab === "activity" ? (
              <a className="button button-secondary" href={`/api/insights/export?automationId=${encodeURIComponent(automationId)}`} download>
                <Download size={15} aria-hidden /> Export CSV
              </a>
            ) : null}
            {tab !== "edit" ? (
              <Link className="button button-primary" href={`${href}/edit`}><Pencil size={15} aria-hidden /> Edit</Link>
            ) : null}
            <AutomationOverflowMenu label={`More actions for ${name}`} items={menuItems} />
          </div>
        </div>
        {actionError ? <p className="form-error auto-detail-error" role="alert">{actionError}</p> : null}
        <nav ref={slidingThumbRef} className="page-tabs auto-view-tabs is-detail" aria-label="Automation views">
          {tabs.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`page-tab${shownTab === item.key ? " is-active" : ""}`}
              aria-current={tab === item.key ? "page" : undefined}
              onClick={() => { if (item.key !== tab) setPendingTab({ tab: item.key, from: pathname }); }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="auto-detail-body">{children}</div>
      <Presence>{historyOpen ? (
        <AutomationVersionsModal
          automationId={automationId}
          onClose={() => setHistoryOpen(false)}
          onRestored={() => {
            clearAutomationsCache();
            router.refresh();
          }}
        />
      ) : null}</Presence>
    </div>
  );
}
