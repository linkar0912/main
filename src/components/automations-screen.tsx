"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { RefreshCw, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { AutomationList, useAutomations } from "./automation-list";
import { AutomationSectionNav } from "./automation-section-nav";
import { useAutomationStats, useDeliveryProblems, useWorkspaceConnections } from "./automation-signals";
import { DeliveryDiagnostics } from "./delivery-diagnostics";
import { slidingThumbRef } from "@/src/components/ui/use-sliding-thumb";
import type { AutomationRecord } from "@/src/lib/repository";
import { automationAttention, isFacebookAutomation, type AutomationAttention } from "@/src/lib/automation-attention";
import {
  AUTOMATION_SORTS,
  AUTOMATION_VIEWS,
  automationViewCounts,
  matchesAutomationView,
  parseAutomationView,
  sortAutomations,
  type AutomationSort,
  type AutomationView,
} from "@/src/lib/automation-groups";
import { toReadableApiError } from "@/src/lib/api-error-message";

type ChannelFilter = "all" | "instagram" | "facebook";
const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

const EMPTY_VIEW_COPY: Record<Exclude<AutomationView, "all">, string> = {
  live: "Nothing is live right now. Turn on a draft or a paused automation to start replying.",
  drafts: "No drafts. Every automation you've built is either live or paused.",
  paused: "Nothing is paused. Everything you've turned on is still replying.",
};

/**
 * The Automations list: view tabs (All · Live · Drafts · Paused) under the
 * page header, a toolbar, then the automations grouped by status with the
 * broken ones first. Sequences and Broadcasts stay one click away at the end
 * of the tab row.
 */
export function AutomationsScreen({ initialAutomations, basePath = "/automations" }: {
  initialAutomations?: AutomationRecord[];
  /** Where detail pages live; the dev preview mounts them under its own path. */
  basePath?: string;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { automations, loading, error, setStatus, reload, addAutomation } = useAutomations(initialAutomations);
  const hasAutomations = automations.length > 0;

  const [view, setView] = useState<AutomationView>(() => parseAutomationView(searchParams?.get("view")));
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [sort, setSort] = useState<AutomationSort>("recent");
  const [range, setRange] = useState<Range>(7);
  const tabRefs = useRef<Partial<Record<AutomationView, HTMLButtonElement | null>>>({});

  const connections = useWorkspaceConnections();
  const problems = useDeliveryProblems(hasAutomations);
  const loadedStats = useAutomationStats(range, hasAutomations);

  const attention = useMemo(() => {
    const map = new Map<string, AutomationAttention>();
    for (const automation of automations) {
      const item = automationAttention(automation, {
        instagram: connections?.instagram ?? null,
        facebook: connections?.facebook ?? null,
        failures: problems,
      });
      if (item) map.set(automation.id, item);
    }
    return map;
  }, [automations, connections, problems]);

  const needle = query.trim().toLowerCase();
  const filtered = automations.filter((automation) =>
    (channel === "all" || (channel === "facebook") === isFacebookAutomation(automation))
    && (!needle || automation.name.toLowerCase().includes(needle)));
  const counts = automationViewCounts(filtered);
  const replies = useMemo(() => new Map([...(loadedStats?.stats ?? new Map()).entries()].map(([id, row]) => [id, row.sent])), [loadedStats]);
  const visible = sortAutomations(filtered.filter((automation) => matchesAutomationView(automation, view)), sort, replies);
  const searching = needle !== "" || channel !== "all";
  const hasFacebook = automations.some(isFacebookAutomation) || (connections?.facebook.length ?? 0) > 0;

  function selectView(next: AutomationView, focus = false) {
    setView(next);
    if (focus) tabRefs.current[next]?.focus();
    // Linkable without a server round trip: Next keeps useSearchParams in
    // step with history.replaceState.
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const keys = AUTOMATION_VIEWS.map((item) => item.key);
    const index = keys.indexOf(view);
    const next = event.key === "ArrowRight" ? keys[(index + 1) % keys.length]
      : event.key === "ArrowLeft" ? keys[(index - 1 + keys.length) % keys.length]
        : event.key === "Home" ? keys[0]
          : event.key === "End" ? keys[keys.length - 1] : null;
    if (!next) return;
    event.preventDefault();
    selectView(next, true);
  }

  async function duplicateAutomation(id: string) {
    const response = await fetch(`/api/automations/${id}/duplicate`, { method: "POST" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Could not duplicate this automation.");
    }
    const payload = (await response.json()) as { data: AutomationRecord };
    addAutomation(payload.data);
    router.push(`${basePath}/${payload.data.id}/edit`);
  }

  async function deleteAutomation(id: string) {
    const response = await fetch(`/api/automations/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(toReadableApiError(payload.error, "Could not delete this automation."));
    }
    await reload();
  }

  const activeTabId = `automations-tab-${view}`;
  const showTabs = hasAutomations || loading;
  let body;
  if (error && automations.length === 0) {
    body = (
      <div className="empty-state is-inline" role="alert">
        <h3>Your automations didn’t load</h3>
        <p>Check your connection and try again.</p>
        <button className="button button-secondary button-small" type="button" onClick={() => void reload()}>
          <RefreshCw size={15} aria-hidden /> Try again
        </button>
      </div>
    );
  } else if (searching && filtered.length === 0 && hasAutomations) {
    body = (
      <div className="empty-state is-inline">
        <span className="empty-icon"><Search size={20} /></span>
        <h3>No matching automations</h3>
        <p>Try another name or channel.</p>
        <button className="button button-secondary button-small" type="button" onClick={() => { setQuery(""); setChannel("all"); }}>Clear filters</button>
      </div>
    );
  } else if (view !== "all" && visible.length === 0 && hasAutomations) {
    body = (
      <div className="empty-state is-inline">
        <p>{EMPTY_VIEW_COPY[view]}</p>
        <button className="button button-secondary button-small" type="button" onClick={() => selectView("all")}>Show all automations</button>
      </div>
    );
  } else {
    body = (
      <AutomationList
        automations={visible}
        loading={loading}
        view={view}
        attention={attention}
        stats={loadedStats?.stats ?? null}
        rangeDays={loadedStats?.days ?? range}
        connections={connections}
        basePath={basePath}
        onStatusChange={setStatus}
        onDuplicate={duplicateAutomation}
        onDelete={deleteAutomation}
        onChanged={() => void reload()}
      />
    );
  }

  return (
    <div className="automation-section automations-index">
      <div className="auto-tabbar">
        {/* A new account has nothing to filter: just the empty state and the way in. */}
        {showTabs ? (
        <div ref={slidingThumbRef} className="page-tabs auto-view-tabs" role="tablist" aria-label="Automation views">
          {AUTOMATION_VIEWS.map(({ key, label }) => (
            <button
              key={key}
              ref={(element) => { tabRefs.current[key] = element; }}
              type="button"
              role="tab"
              id={`automations-tab-${key}`}
              aria-controls="automations-panel"
              aria-selected={view === key}
              tabIndex={view === key ? 0 : -1}
              className={`page-tab${view === key ? " is-active" : ""}`}
              onClick={() => selectView(key)}
              onKeyDown={onTabKey}
            >
              <span>{label}</span>
              <span className="auto-tab-count">{counts[key]}</span>
            </button>
          ))}
        </div>
        ) : null}
        <AutomationSectionNav active="my" basePath={basePath} />
      </div>

      {hasAutomations ? (
        <div className="auto-toolbar">
          <label className="list-search auto-search">
            <Search size={16} aria-hidden />
            <input
              type="search"
              aria-label="Search automations"
              placeholder="Search automations"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {hasFacebook ? (
            <label className="auto-select">
              <span className="sr-only">Channel</span>
              <select value={channel} onChange={(event) => setChannel(event.target.value as ChannelFilter)}>
                <option value="all">All channels</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
              </select>
            </label>
          ) : null}
          <label className="auto-select">
            <span className="sr-only">Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as AutomationSort)}>
              {AUTOMATION_SORTS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
          <div ref={slidingThumbRef} className="segmented auto-range" role="group" aria-label="Replies over the last">
            {RANGES.map((option) => (
              <button
                key={option}
                type="button"
                className={`segmented-option ${range === option ? "is-on" : ""}`}
                aria-pressed={range === option}
                onClick={() => setRange(option)}
              >
                {option} days
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <section
        className="surface auto-surface"
        id="automations-panel"
        role={showTabs ? "tabpanel" : undefined}
        aria-labelledby={showTabs ? activeTabId : undefined}
        aria-label={showTabs ? undefined : "Your automations"}
      >
        {error && hasAutomations ? <p className="form-error" role="alert">{error}</p> : null}
        {body}
      </section>
      {hasAutomations && <DeliveryDiagnostics problems={problems} />}
    </div>
  );
}
