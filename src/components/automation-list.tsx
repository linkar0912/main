"use client";

import { Presence } from "@/src/components/ui/use-presence";
import Link from "next/link";
import { Activity, ChevronDown, Copy, History, Pencil, Trash2, Workflow } from "lucide-react";
import { FacebookGlyph } from "./facebook-glyph";
import { InstagramGlyph } from "./instagram-glyph";
import { useEffect, useId, useRef, useState } from "react";
import { CreateAutomationButton } from "./create-automation-button";
import { AutomationOverflowMenu, type OverflowMenuItem } from "./automation-overflow-menu";
import { AutomationVersionsModal } from "./automation-versions-modal";
import { AutomationListContentSkeleton } from "./skeleton";
import { Collapse } from "./ui/collapse";
import { RelativeTime } from "./ui/relative-time";
import { StatusBadge } from "./ui/status-badge";
import type { AutomationRecord, AutomationStatus } from "@/src/lib/repository";
import type { FacebookPageSummary, InstagramConnectionSummary } from "@/src/lib/client/workspace-data";
import { isFacebookAutomation, type AutomationAttention } from "@/src/lib/automation-attention";
import { groupAutomations, type AutomationGroupKey, type AutomationView } from "@/src/lib/automation-groups";
import { toReadableApiError } from "@/src/lib/validation-error";

async function requestAutomations(signal?: AbortSignal): Promise<AutomationRecord[]> {
  const response = await fetch("/api/automations", { signal });
  const payload = (await response.json().catch(() => ({}))) as { data?: AutomationRecord[] };
  if (!response.ok) throw new Error("Could not load automations");
  return payload.data ?? [];
}

// Module-level stale-while-revalidate cache, mirroring
// src/lib/client/workspace-data.ts: Home and /automations both need the list,
// and repeat visits should paint confirmed rows instantly instead of flashing
// skeletons on every navigation.
const AUTOMATIONS_FRESH_FOR_MS = 30_000;
const automationsCache: { value?: AutomationRecord[]; fetchedAt?: number } = {};

function readFreshAutomations(): AutomationRecord[] | undefined {
  if (automationsCache.value === undefined || automationsCache.fetchedAt === undefined) return undefined;
  return Date.now() - automationsCache.fetchedAt < AUTOMATIONS_FRESH_FOR_MS ? automationsCache.value : undefined;
}

/** Seed from a Server Component's initial data. The empty-cache guard keeps
 * older server data from overwriting fresher client state (mutations PATCH
 * through setStatus, which syncs the cache). */
export function seedAutomations(value: AutomationRecord[]): void {
  if (automationsCache.value !== undefined) return;
  automationsCache.value = value;
  automationsCache.fetchedAt = Date.now();
}

function storeAutomations(value: AutomationRecord[]): void {
  automationsCache.value = value;
  automationsCache.fetchedAt = Date.now();
}

/** Test isolation helper: clears the module cache between specs. */
export function clearAutomationsCache(): void {
  automationsCache.value = undefined;
  automationsCache.fetchedAt = undefined;
}

/** Puts one updated automation into the shared list cache (detail page edits). */
export function syncAutomationInCache(automation: AutomationRecord): void {
  if (automationsCache.value === undefined) return;
  automationsCache.value = automationsCache.value.map((item) => item.id === automation.id ? automation : item);
}

/** Drops a deleted automation from the shared list cache. */
export function removeAutomationFromCache(id: string): void {
  if (automationsCache.value === undefined) return;
  automationsCache.value = automationsCache.value.filter((item) => item.id !== id);
}

export function useAutomations(initialData?: AutomationRecord[]) {
  // Server-provided rows win for the first render. The module cache lives for
  // the whole server process during SSR and is shared by every request, so it
  // is only ever read or written in the browser - otherwise one workspace's
  // seeded rows would render for the next request that arrives without
  // initialData.
  const [automations, setAutomations] = useState<AutomationRecord[]>(() => {
    const inBrowser = typeof window !== "undefined";
    if (initialData) {
      if (inBrowser) seedAutomations(initialData);
      return initialData;
    }
    return inBrowser ? automationsCache.value ?? [] : [];
  });
  const seededFromServer = useRef(initialData !== undefined);
  const [loading, setLoading] = useState(() =>
    initialData === undefined && (typeof window === "undefined" || readFreshAutomations() === undefined));
  const [error, setError] = useState("");

  useEffect(() => {
    // A fresh cache (seeded by the server-rendered page or a recent visit)
    // needs no request at all; a stale one keeps its rows on screen while the
    // refresh happens in the background.
    if (seededFromServer.current || readFreshAutomations() !== undefined) return;
    // AbortController + signal both cancel the in-flight fetch and gate the
    // setters; the `mounted` flag covers the synchronous render path where
    // the fetch is still in flight.
    const controller = new AbortController();
    let mounted = true;
    void requestAutomations(controller.signal)
      .then((data) => {
        storeAutomations(data);
        if (mounted) {
          setAutomations(data);
          setError("");
        }
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        if (mounted) setError(caught instanceof Error ? caught.message : "Could not load automations");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  async function reload() {
    setLoading(true);
    try {
      const data = await requestAutomations();
      storeAutomations(data);
      setAutomations(data);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load automations");
    } finally {
      setLoading(false);
    }
  }

  function addAutomation(automation: AutomationRecord) {
    setAutomations((current) => {
      const next = [automation, ...current.filter((item) => item.id !== automation.id)];
      storeAutomations(next);
      return next;
    });
  }

  async function setStatus(id: string, status: AutomationStatus) {
    const response = await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = (await response.json().catch(() => ({}))) as { data?: AutomationRecord; error?: string };
    // A refused activation (409) explains what to fix - surface it as-is.
    if (!response.ok || !payload.data) throw new Error(toReadableApiError(payload.error, "Could not update automation"));
    setAutomations((current) => {
      const next = current.map((automation) => automation.id === id ? payload.data as AutomationRecord : automation);
      storeAutomations(next);
      return next;
    });
  }

  return { automations, loading, error, reload, setStatus, addAutomation };
}

/** What starts it, as neutral chips: the trigger, then up to two keywords. */
export function triggerChips(automation: AutomationRecord): { trigger: string; keywords: string[]; more: string[] } {
  const split = (trigger: string, keywords: string[]) => ({ trigger, keywords: keywords.slice(0, 2), more: keywords.slice(2) });
  const definition = automation.definition;
  if (definition.version === 2) {
    const keywords = definition.trigger.match === "keyword" ? definition.trigger.keywords : [];
    return split(keywords.length ? "Comment" : "Any comment", keywords);
  }
  const trigger = definition.trigger;
  switch (trigger.type) {
    case "referral": return split("Referral link", []);
    case "optin": return split("Opt-in tap", []);
    case "first_contact": return split("First message", []);
    case "story_mention": return split("Story mention", []);
    default: {
      const noun = trigger.type === "comment"
        ? isFacebookAutomation(automation) ? "Page comment" : "Comment"
        : trigger.type === "story_reply" ? "Story reply" : "DM";
      const keywords = trigger.match === "keyword" ? trigger.keywords : [];
      if (keywords.length) return split(noun, keywords);
      return split(noun === "DM" ? "Any DM" : `Any ${noun.toLowerCase()}`, []);
    }
  }
}

export type AutomationRowStats = { sent: number; failed: number };
export type AutomationConnections = { instagram: InstagramConnectionSummary[]; facebook: FacebookPageSummary[] };

/** Which account or Page it runs on - only worth saying when there is more than one. */
function placeLabel(automation: AutomationRecord, connections: AutomationConnections | null | undefined): string | null {
  if (!connections) return null;
  if (isFacebookAutomation(automation)) {
    if (connections.facebook.length < 2) return null;
    return connections.facebook.find((page) => page.pageId === automation.facebookPageId)?.pageName ?? "A Facebook Page";
  }
  if (connections.instagram.length < 2) return null;
  if (!automation.instagramAccountId) return "All accounts";
  const username = connections.instagram.find((account) => account.igUserId === automation.instagramAccountId)?.username;
  return username ? `@${username.replace(/^@/, "")}` : "An Instagram account";
}

function count(value: number): string {
  return value.toLocaleString("en-IN");
}

export function AutomationList({
  automations,
  loading,
  view = "all",
  attention,
  stats,
  rangeDays = 7,
  connections,
  basePath = "/automations",
  onStatusChange,
  onDuplicate,
  onDelete,
  onChanged,
}: {
  automations: AutomationRecord[];
  loading: boolean;
  /** The view tab: narrows the status groups shown. */
  view?: AutomationView;
  /** Live automations with a problem, by id; they lead in "Needs attention". */
  attention?: ReadonlyMap<string, AutomationAttention>;
  /** Replies and failures per automation in the toolbar's range; null while unknown. */
  stats?: ReadonlyMap<string, AutomationRowStats> | null;
  rangeDays?: number;
  connections?: AutomationConnections | null;
  /** Where the detail pages live (the dev preview mounts them elsewhere). */
  basePath?: string;
  onStatusChange: (id: string, status: AutomationStatus) => Promise<void>;
  onDuplicate?: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  /** Called after something changed server-side (e.g. a version restore). */
  onChanged?: () => void;
}) {
  const [pendingId, setPendingId] = useState("");
  const [historyForId, setHistoryForId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<AutomationGroupKey>>(() => new Set());
  const baseId = useId();

  async function runAction(id: string, action: () => Promise<void>) {
    if (pendingId) return;
    setPendingId(id);
    setActionError("");
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "That action failed.");
    } finally {
      setPendingId("");
    }
  }

  function toggleGroup(key: AutomationGroupKey) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading && automations.length === 0) {
    return <AutomationListContentSkeleton />;
  }
  if (automations.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon"><Workflow size={22} /></span>
        <h3>No automations yet</h3>
        <p>Create one to reply to comments and DMs automatically.</p>
        <CreateAutomationButton className="button button-secondary">Create automation</CreateAutomationButton>
      </div>
    );
  }

  function statsLine(automation: AutomationRecord) {
    if (automation.status === "DRAFT") {
      return <span>Not turned on yet. Edited <RelativeTime value={automation.updatedAt} inline /></span>;
    }
    if (!stats) return <span>Edited <RelativeTime value={automation.updatedAt} inline /></span>;
    const row = stats.get(automation.id);
    const sent = row?.sent ?? 0;
    return (
      <>
        <span>{sent === 0 ? `No replies in ${rangeDays} days` : `${count(sent)} ${sent === 1 ? "reply" : "replies"} in ${rangeDays} days`}</span>
        {row && row.failed > 0 ? <span>{count(row.failed)} failed</span> : null}
      </>
    );
  }

  function renderRow(automation: AutomationRecord) {
    const facebook = isFacebookAutomation(automation);
    const isActive = automation.status === "ACTIVE";
    const isDraft = automation.status === "DRAFT";
    const pending = pendingId === automation.id;
    const problem = attention?.get(automation.id) ?? null;
    const chips = triggerChips(automation);
    const place = placeLabel(automation, connections);
    const detailHref = `${basePath}/${automation.id}`;
    const hasActivity = automation.definition.version === 2 || facebook;
    const name = automation.name;

    const menuItems: OverflowMenuItem[] = [
      { key: "edit", label: "Edit", icon: <Pencil size={16} aria-hidden />, href: `${detailHref}/edit`, ariaLabel: `Edit ${name}` },
      ...(hasActivity
        ? [{ key: "activity", label: "View activity", icon: <Activity size={16} aria-hidden />, href: `${detailHref}/activity`, ariaLabel: `View activity for ${name}` }]
        : []),
      { key: "history", label: "Version history", icon: <History size={16} aria-hidden />, ariaLabel: `View history for ${name}`, onSelect: () => setHistoryForId(automation.id) },
      ...(onDuplicate
        ? [{ key: "duplicate", label: "Duplicate", icon: <Copy size={16} aria-hidden />, ariaLabel: `Duplicate ${name}`, disabled: pending, onSelect: () => void runAction(automation.id, () => onDuplicate(automation.id)) }]
        : []),
      ...(onDelete
        ? [{
          key: "delete",
          label: "Delete",
          icon: <Trash2 size={16} aria-hidden />,
          danger: true,
          ariaLabel: `Delete ${name}`,
          confirm: { label: "Confirm delete?", ariaLabel: `Confirm delete ${name}` },
          onSelect: () => void runAction(automation.id, () => onDelete(automation.id)),
        }]
        : []),
    ];

    // One contextual action at most: fix what's broken, or turn a draft on.
    let contextual = null;
    if (problem && problem.reason !== "failures") {
      contextual = <Link className="button button-secondary button-small auto-row-cta" href="/settings" aria-label={`${problem.actionLabel} the account for ${name}`}>{problem.actionLabel}</Link>;
    } else if (problem) {
      contextual = <Link className="button button-secondary button-small auto-row-cta" href={detailHref} aria-label={`Fix ${name}`}>{problem.actionLabel}</Link>;
    } else if (isDraft) {
      contextual = (
        <button
          className="button button-secondary button-small auto-row-cta"
          type="button"
          disabled={pending}
          aria-label={`Turn on ${name}`}
          onClick={() => void runAction(automation.id, () => onStatusChange(automation.id, "ACTIVE"))}
        >
          Turn on
        </button>
      );
    }

    return (
      <li key={automation.id}>
        <article className="auto-row" data-status={automation.status.toLowerCase()} aria-labelledby={`${baseId}-${automation.id}`}>
          <span className={`auto-row-channel ${facebook ? "is-facebook" : "is-instagram"}`} aria-hidden>
            {facebook ? <FacebookGlyph size={18} brand /> : <InstagramGlyph size={18} brand />}
          </span>
          <div className="auto-row-main">
            <Link className="auto-row-name" id={`${baseId}-${automation.id}`} href={detailHref} title={name}>{name}</Link>
            <p className="auto-row-line">
              <span className="auto-row-chips" title={chips.more.length ? [...chips.keywords, ...chips.more].join(", ") : undefined}>
                <span className="auto-chip is-trigger">{chips.trigger}</span>
                {chips.keywords.map((keyword) => <span className="auto-chip" key={keyword}>{keyword}</span>)}
                {chips.more.length ? <span className="auto-chip is-more">+{chips.more.length}</span> : null}
              </span>
              {problem ? (
                <span className="auto-row-problem" title={problem.text}>
                  <StatusBadge tone={problem.tone} label={problem.chip} />
                  <span className="auto-row-problem-text">{problem.short}</span>
                </span>
              ) : (
                <span className="auto-row-stats">
                  {statsLine(automation)}
                  {place ? <span>{place}</span> : null}
                </span>
              )}
            </p>
          </div>
          <div className="auto-row-actions" role="group" aria-label={`Actions for ${name}`}>
            {contextual}
            {!isDraft ? (
              <button
                className="status-switch auto-row-switch"
                type="button"
                data-state={automation.status.toLowerCase()}
                aria-pressed={isActive}
                disabled={pending}
                aria-label={`${isActive ? "Pause" : "Activate"} ${name}`}
                title={isActive ? "Live. Click to pause." : "Paused. Click to turn on."}
                onClick={() => void runAction(automation.id, () => onStatusChange(automation.id, isActive ? "PAUSED" : "ACTIVE"))}
              >
                <span className="status-switch-track" aria-hidden><span /></span>
              </button>
            ) : null}
            <AutomationOverflowMenu label={`More actions for ${name}`} items={menuItems} />
          </div>
        </article>
      </li>
    );
  }

  const groups = groupAutomations(automations, view, (automation) => attention?.has(automation.id) ?? false);
  // One group needs no heading: the selected tab already names it.
  const showHeads = groups.length > 1;
  return (
    <div className="auto-list">
      {actionError && <p className="form-error auto-list-error" role="alert">{actionError}</p>}
      {groups.map((group) => {
        const open = !collapsed.has(group.key);
        const bodyId = `${baseId}-group-${group.key}`;
        const rows = (
          <ul className="auto-rows" aria-label={showHeads ? undefined : group.label}>
            {group.items.map(renderRow)}
          </ul>
        );
        return (
          <section key={group.key} className="auto-group" data-group={group.key} aria-label={`${group.label} (${group.items.length})`}>
            {showHeads ? (
              <h2 className="auto-group-head">
                <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => toggleGroup(group.key)}>
                  <ChevronDown className="auto-group-chevron" size={16} aria-hidden />
                  <span>{group.label}</span>
                  <span className="auto-group-count">{group.items.length}</span>
                </button>
              </h2>
            ) : null}
            {showHeads ? <Collapse open={open} id={bodyId}>{open && rows}</Collapse> : rows}
          </section>
        );
      })}
      <Presence>{historyForId && (
        <AutomationVersionsModal
          automationId={historyForId}
          onClose={() => setHistoryForId(null)}
          onRestored={onChanged}
        />
      )}</Presence>
    </div>
  );
}

