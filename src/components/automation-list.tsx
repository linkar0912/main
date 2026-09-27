"use client";

import Link from "next/link";
import { Activity, ArrowRight, ArrowUpRight, Copy, History, Pencil, Trash2, Workflow } from "lucide-react";
import { FacebookGlyph } from "./facebook-glyph";
import { InstagramGlyph } from "./instagram-glyph";
import { useEffect, useRef, useState } from "react";
import { CreateAutomationButton } from "./create-automation-button";
import { AutomationVersionsModal } from "./automation-versions-modal";
import { AutomationListContentSkeleton } from "./skeleton";
import { StatusBadge } from "./status-badge";
import type { AutomationRecord, AutomationStatus } from "@/src/lib/repository";
import { getInstagramConnections, getFacebookPages } from "@/src/lib/client/workspace-data";

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

export function useAutomations(initialData?: AutomationRecord[]) {
  // Server-provided rows win for the first render. The module cache is shared
  // across requests during SSR, so reading it first could render stale (or
  // another session's) rows and then mismatch on hydration.
  const [automations, setAutomations] = useState<AutomationRecord[]>(() => {
    if (initialData) {
      seedAutomations(initialData);
      return initialData;
    }
    return automationsCache.value ?? [];
  });
  const seededFromServer = useRef(initialData !== undefined);
  const [loading, setLoading] = useState(() => initialData === undefined && readFreshAutomations() === undefined);
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
    const payload = (await response.json().catch(() => ({}))) as { data?: AutomationRecord };
    if (!response.ok || !payload.data) throw new Error("Could not update automation");
    setAutomations((current) => {
      const next = current.map((automation) => automation.id === id ? payload.data as AutomationRecord : automation);
      storeAutomations(next);
      return next;
    });
  }

  return { automations, loading, error, reload, setStatus, addAutomation };
}

/** What starts the automation, split so keywords can render as chips. */
function triggerParts(automation: AutomationRecord): { source: string; keywords: string[] } {
  const trigger = automation.definition.trigger;
  if (trigger.type === "referral") return { source: "Referral link tap", keywords: [] };
  if (trigger.type === "optin") return { source: "Opt-in tap", keywords: [] };
  if (trigger.type === "first_contact") return { source: "First-time contact", keywords: [] };
  if (trigger.type === "story_mention") return { source: "Story mention", keywords: [] };
  const noun = trigger.type === "comment" ? "comment" : trigger.type === "story_reply" ? "Story reply" : "DM";
  if (trigger.match === "any" || trigger.keywords.length === 0) return { source: `Any ${noun}`, keywords: [] };
  return { source: `${noun === "comment" ? "Comment" : noun} has`, keywords: trigger.keywords };
}

function TriggerRule({ automation }: { automation: AutomationRecord }) {
  const { source, keywords } = triggerParts(automation);
  const shown = keywords.slice(0, 3);
  return (
    <span className="automation-trigger">
      <span className="automation-trigger-source">{source}</span>
      {shown.map((keyword) => <span className="automation-keyword" key={keyword}>{keyword}</span>)}
      {keywords.length > shown.length ? <span className="automation-keyword is-more" title={keywords.slice(3).join(", ")}>+{keywords.length - shown.length}</span> : null}
    </span>
  );
}

function actionSummary(automation: AutomationRecord): string {
  if (automation.definition.version !== 1) return "Follow-gated DM delivery";

  if (automation.facebookPageId) return "Public comment reply";

  const action = automation.definition.actions[0];
  if (!action) return "No action configured";
  // Every action type gets its own label - `send_image` and `quick_replies`
  // used to fall through the bottom of this chain and read as "Send a button".
  switch (action.type) {
    case "private_reply": return "Private reply";
    case "send_text": return "Send a DM";
    case "send_link": return "Send a link";
    case "send_image": return "Send an image";
    case "quick_replies": return "Send quick replies";
    case "send_button": return "Send a button";
  }
}

/** igUserId -> @username for every connected account, for the per-row account chips. */
function useConnectionUsernames(): Map<string, string> {
  const [usernames, setUsernames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let active = true;
    getInstagramConnections()
      .then((data) => {
        if (!active) return;
        setUsernames(new Map(
          data
            .filter((connection) => connection.igUserId && connection.username)
            .map((connection) => [connection.igUserId!, connection.username!]),
        ));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return usernames;
}

/** id-by-pageId map for Facebook Page pin badges. The list view doesn't
 * display the Page name unless the user hovers; a future iteration can
 * promote this to a chip with the page glyph. */
function useFacebookPageNames(): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let active = true;
    getFacebookPages()
      .then((data) => {
        if (!active) return;
        setNames(new Map(
          data
            .filter((page) => page.pageId && page.pageName)
            .map((page) => [page.pageId, page.pageName]),
        ));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return names;
}

export function AutomationList({
  automations,
  loading,
  compact = false,
  onStatusChange,
  onDuplicate,
  onDelete,
  onChanged,
}: {
  automations: AutomationRecord[];
  loading: boolean;
  compact?: boolean;
  onStatusChange: (id: string, status: AutomationStatus) => Promise<void>;
  /** Optional management actions; omitted by the dashboard's compact list. */
  onDuplicate?: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  /** Called after something changed server-side (e.g. a version restore). */
  onChanged?: () => void;
}) {
  const [pendingId, setPendingId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [historyForId, setHistoryForId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const usernames = useConnectionUsernames();
  const facebookPageNames = useFacebookPageNames();
  // With a single connection the account chip adds nothing - every automation
  // runs on that one account anyway. Show chips only for multi-account workspaces.
  const showAccountChips = usernames.size > 1;
  // Same logic for Facebook Pages: a single Page means every Facebook-pinned
  // automation targets it, so the chip is noise. Multi-Page workspaces need
  // to see which Page is pinned.
  const showFacebookPageChips = facebookPageNames.size > 1;

  function accountChip(automation: AutomationRecord) {
    if (!showAccountChips) return null;
    return (
      <span className="automation-account" title={automation.instagramAccountId ?? undefined}>
        {automation.instagramAccountId ? `@${usernames.get(automation.instagramAccountId) ?? "account"}` : "All accounts"}
      </span>
    );
  }

  function facebookPageChip(automation: AutomationRecord) {
    if (!automation.facebookPageId) return null;
    if (showFacebookPageChips) {
      return (
        <span className="automation-account" title={automation.facebookPageId}>
          Page: {facebookPageNames.get(automation.facebookPageId) ?? automation.facebookPageId}
        </span>
      );
    }
    return (
      <span className="automation-account" title={automation.facebookPageId}>
        Pinned to Facebook Page
      </span>
    );
  }

  async function runAction(id: string, action: () => Promise<void>) {
    if (pendingId) return;
    setPendingId(id);
    setActionError("");
    try {
      await action();
      setConfirmDeleteId("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "That action failed.");
    } finally {
      setPendingId("");
    }
  }

  if (loading && automations.length === 0) {
    return <AutomationListContentSkeleton />;
  }
  if (automations.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon"><Workflow size={22} /></span>
        <h3>Your first automation starts here.</h3>
        <p>Turn one clear customer signal into one useful reply.</p>
        <CreateAutomationButton className="button button-secondary">Create automation</CreateAutomationButton>
      </div>
    );
  }

  const visible = compact ? automations.slice(0, 3) : automations;
  return (
    <div className={`automation-list ${compact ? "is-compact" : ""}`}>
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      {!compact && (
        <div className="automation-columns" aria-hidden>
          <span>Automation</span><span>Channel</span><span>Status</span>
        </div>
      )}
      {visible.map((automation) => {
        const isFacebook = automation.provider === "FACEBOOK" || Boolean(automation.facebookPageId);
        const isActive = automation.status === "ACTIVE";
        const pending = pendingId === automation.id;
        return (
        <article className="automation-row" key={automation.id} data-status={automation.status.toLowerCase()}>
          <div className="automation-identity">
            <span className={`automation-channel ${isFacebook ? "is-facebook" : "is-instagram"}`} aria-hidden>
              {isFacebook ? <FacebookGlyph size={18} brand /> : <InstagramGlyph size={18} brand />}
            </span>
            <div className="automation-copy">
              <div className="automation-title">
                <Link className="automation-name" href={`/automations/${automation.id}/edit`}><strong>{automation.name}</strong></Link>
                {compact ? <StatusBadge status={automation.status} /> : null}
              </div>
              <p className="automation-rule">
                <TriggerRule automation={automation} />
                <ArrowRight size={13} aria-hidden />
                <span className="automation-response">{actionSummary(automation)}</span>
              </p>
            </div>
          </div>
          <div className="automation-meta">
            <span>{isFacebook ? "Facebook" : "Instagram"}</span>
            <span>{isFacebook ? "Page comments" : automation.definition.trigger.type === "comment" ? "Comments" : "Messaging"}</span>
            {showAccountChips ? accountChip(automation) : null}
            {facebookPageChip(automation)}
          </div>
          {!compact && (
            <div className="automation-actions" aria-label={`Actions for ${automation.name}`}>
              <button
                className="status-switch"
                type="button"
                data-state={automation.status.toLowerCase()}
                aria-pressed={isActive}
                disabled={pending}
                aria-label={`${isActive ? "Pause" : "Activate"} ${automation.name}`}
                title={isActive ? "Pause automation" : "Activate automation"}
                onClick={() => void runAction(
                  automation.id,
                  () => onStatusChange(automation.id, isActive ? "PAUSED" : "ACTIVE"),
                )}
              >
                <span className="status-switch-track" aria-hidden><span /></span>
                <span className="status-switch-label">{isActive ? "Active" : automation.status === "DRAFT" ? "Draft" : "Paused"}</span>
              </button>
              <Link
                className="icon-button"
                href={`/automations/${automation.id}/edit`}
                aria-label={`Edit ${automation.name}`}
                title="Edit automation"
              >
                <Pencil size={15} />
              </Link>
              {(automation.definition.version === 2 || isFacebook) && (
                <Link
                  className="icon-button"
                  href={`/automations/${automation.id}/activity`}
                  aria-label={`View activity for ${automation.name}`}
                  title="View activity"
                >
                  <Activity size={15} />
                </Link>
              )}
              <button
                className="icon-button"
                type="button"
                aria-label={`View history for ${automation.name}`}
                title="Version history"
                onClick={() => setHistoryForId(automation.id)}
              >
                <History size={15} />
              </button>
              {onDuplicate && (
                <button
                  className="icon-button"
                  type="button"
                  disabled={pending}
                  aria-label={`Duplicate ${automation.name}`}
                  title="Duplicate automation"
                  onClick={() => void runAction(automation.id, () => onDuplicate(automation.id))}
                >
                  <Copy size={15} />
                </button>
              )}
              {onDelete && (
                confirmDeleteId === automation.id ? (
                  <button
                    className="icon-button icon-danger is-confirming"
                    type="button"
                    disabled={pending}
                    aria-label={`Confirm delete ${automation.name}`}
                    title="Click again to permanently delete"
                    onClick={() => void runAction(automation.id, () => onDelete(automation.id))}
                  >
                    <Trash2 size={15} />
                  </button>
                ) : (
                  <button
                    className="icon-button icon-danger"
                    type="button"
                    aria-label={`Delete ${automation.name}`}
                    title="Delete automation"
                    onClick={() => setConfirmDeleteId(automation.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                )
              )}
            </div>
          )}
          {compact && <Link className="row-link" href="/automations" aria-label="Open automations"><ArrowUpRight size={17} /></Link>}
        </article>
        );
      })}
      {compact && automations.length > visible.length && <Link className="list-more" href="/automations">View all {automations.length} automations <ArrowUpRight size={15} /></Link>}
      {historyForId && (
        <AutomationVersionsModal
          automationId={historyForId}
          onClose={() => setHistoryForId(null)}
          onRestored={onChanged}
        />
      )}
    </div>
  );
}
