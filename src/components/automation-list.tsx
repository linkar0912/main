"use client";

import Link from "next/link";
import { Activity, ArrowUpRight, Copy, History, Pause, Pencil, Play, Trash2, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { CreateAutomationButton } from "./create-automation-button";
import { AutomationVersionsModal } from "./automation-versions-modal";
import { StatusBadge } from "./status-badge";
import type { AutomationRecord, AutomationStatus } from "@/src/lib/repository";
import { getInstagramConnections, getFacebookPages } from "@/src/lib/client/workspace-data";

async function requestAutomations(signal?: AbortSignal): Promise<AutomationRecord[]> {
  const response = await fetch("/api/automations", { signal });
  const payload = (await response.json()) as { data?: AutomationRecord[] };
  if (!response.ok) throw new Error("Could not load automations");
  return payload.data ?? [];
}

export function useAutomations() {
  const [automations, setAutomations] = useState<AutomationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // AbortController + signal both cancel the in-flight fetch and gate the
    // setters; the `mounted` flag covers the synchronous render path where
    // the fetch is still in flight.
    const controller = new AbortController();
    let mounted = true;
    void requestAutomations(controller.signal)
      .then((data) => {
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
      setAutomations(data);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load automations");
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(id: string, status: AutomationStatus) {
    const response = await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = (await response.json()) as { data?: AutomationRecord };
    if (!response.ok || !payload.data) throw new Error("Could not update automation");
    setAutomations((current) => current.map((automation) => automation.id === id ? payload.data as AutomationRecord : automation));
  }

  return { automations, loading, error, reload, setStatus };
}

function triggerSummary(automation: AutomationRecord): string {
  const trigger = automation.definition.trigger;
  if (trigger.type === "referral") return "Referral link tap";
  if (trigger.type === "optin") return "Opt-in tap";
  if (trigger.type === "first_contact") return "First-time contact";
  if (trigger.type === "story_mention") return "Story mention";
  const source = trigger.type === "comment" ? "Comment" : "DM";
  const match = trigger.match === "any" ? "any message" : trigger.keywords.join(", ");
  return `${source} contains ${match || "a keyword"}`;
}

function actionSummary(automation: AutomationRecord): string {
  if (automation.definition.version !== 1) return "Follow-gated DM delivery";

  if (automation.facebookPageId) return "Public comment reply";

  const action = automation.definition.actions[0];
  if (!action) return "No action configured";
  if (action.type === "private_reply") return "Private reply";
  if (action.type === "send_text") return "Send a DM";
  if (action.type === "send_link") return "Send a link";
  return "Send a button";
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
}: {
  automations: AutomationRecord[];
  loading: boolean;
  compact?: boolean;
  onStatusChange: (id: string, status: AutomationStatus) => Promise<void>;
  /** Optional management actions; omitted by the dashboard's compact list. */
  onDuplicate?: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
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

  if (loading) {
    return <div className="empty-state"><div className="loading-line" /><div className="loading-line short" /><div className="loading-line" /></div>;
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
      {visible.map((automation) => (
        <article className="automation-row" key={automation.id}>
          <div className="automation-icon"><Workflow size={19} strokeWidth={1.7} /></div>
          <div className="automation-copy">
            <div className="automation-title"><strong>{automation.name}</strong><StatusBadge status={automation.status} /></div>
            <p>
              {triggerSummary(automation)} <span className="row-divider">·</span> {actionSummary(automation)}
              {showAccountChips && (
                <>
                  {" "}<span className="row-divider">·</span> {accountChip(automation)}
                </>
              )}
              {facebookPageChip(automation) && (
                <>
                  {" "}<span className="row-divider">·</span> {facebookPageChip(automation)}
                </>
              )}
            </p>
          </div>
          {!compact && (
            <div className="automation-actions" aria-label={`Actions for ${automation.name}`}>
              <Link
                className="icon-button"
                href={`/automations/${automation.id}/edit`}
                aria-label={`Edit ${automation.name}`}
                title="Edit automation"
              >
                <Pencil size={16} />
              </Link>
              {automation.definition.version === 2 && (
                <Link
                  className="icon-button"
                  href={`/automations/${automation.id}/activity`}
                  aria-label={`View activity for ${automation.name}`}
                  title="View activity"
                >
                  <Activity size={16} />
                </Link>
              )}
              <button
                className="icon-button"
                type="button"
                aria-label={`View history for ${automation.name}`}
                title="Version history"
                onClick={() => setHistoryForId(automation.id)}
              >
                <History size={16} />
              </button>
              <button
                className="icon-button"
                type="button"
                disabled={pendingId === automation.id}
                aria-label={`${automation.status === "ACTIVE" ? "Pause" : "Activate"} ${automation.name}`}
                title={automation.status === "ACTIVE" ? "Pause automation" : "Activate automation"}
                onClick={() => void runAction(
                  automation.id,
                  () => onStatusChange(automation.id, automation.status === "ACTIVE" ? "PAUSED" : "ACTIVE"),
                )}
              >
                {automation.status === "ACTIVE" ? <Pause size={16} /> : <Play size={16} />}
              </button>
              {onDuplicate && (
                <button
                  className="icon-button"
                  type="button"
                  disabled={pendingId === automation.id}
                  aria-label={`Duplicate ${automation.name}`}
                  title="Duplicate automation"
                  onClick={() => void runAction(automation.id, () => onDuplicate(automation.id))}
                >
                  <Copy size={16} />
                </button>
              )}
              {onDelete && (
                confirmDeleteId === automation.id ? (
                  <button
                    className="icon-button icon-danger"
                    type="button"
                    disabled={pendingId === automation.id}
                    aria-label={`Confirm delete ${automation.name}`}
                    title="Click again to permanently delete"
                    onClick={() => void runAction(automation.id, () => onDelete(automation.id))}
                  >
                    <Trash2 size={16} />
                  </button>
                ) : (
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Delete ${automation.name}`}
                    title="Delete automation"
                    onClick={() => setConfirmDeleteId(automation.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                )
              )}
            </div>
          )}
          {compact && <Link className="row-link" href="/automations"><ArrowUpRight size={17} /></Link>}
        </article>
      ))}
      {compact && automations.length > visible.length && <Link className="list-more" href="/automations">View all {automations.length} automations <ArrowUpRight size={15} /></Link>}
      {historyForId && (
        <AutomationVersionsModal
          automationId={historyForId}
          onClose={() => setHistoryForId(null)}
        />
      )}
    </div>
  );
}
