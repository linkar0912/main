/**
 * How the Automations list is cut up: the view tabs (All · Live · Drafts ·
 * Paused), the status groups under them (Needs attention first), and the
 * toolbar's sort. Pure, so the rules are pinned by tests rather than by
 * whatever the screen happens to render.
 */

export type AutomationView = "all" | "live" | "drafts" | "paused";

export const AUTOMATION_VIEWS: ReadonlyArray<{ key: AutomationView; label: string }> = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "drafts", label: "Drafts" },
  { key: "paused", label: "Paused" },
];

export type AutomationGroupKey = "attention" | "live" | "drafts" | "paused";

export const AUTOMATION_GROUP_LABELS: Record<AutomationGroupKey, string> = {
  attention: "Needs attention",
  live: "Live",
  drafts: "Drafts",
  paused: "Paused",
};

export type AutomationSort = "recent" | "replies" | "name" | "newest";

export const AUTOMATION_SORTS: ReadonlyArray<{ key: AutomationSort; label: string }> = [
  { key: "recent", label: "Recently edited" },
  { key: "replies", label: "Most replies" },
  { key: "name", label: "Name A to Z" },
  { key: "newest", label: "Newest first" },
];

type Groupable = { id: string; name: string; status: string; createdAt: string; updatedAt: string };

const VIEW_STATUS: Record<Exclude<AutomationView, "all">, string> = {
  live: "ACTIVE",
  drafts: "DRAFT",
  paused: "PAUSED",
};

/** ?view= from the URL; anything unknown is the All tab. */
export function parseAutomationView(value: string | null | undefined): AutomationView {
  return value === "live" || value === "drafts" || value === "paused" ? value : "all";
}

export function matchesAutomationView(automation: { status: string }, view: AutomationView): boolean {
  return view === "all" || automation.status === VIEW_STATUS[view];
}

export function automationViewCounts(automations: ReadonlyArray<{ status: string }>): Record<AutomationView, number> {
  return {
    all: automations.length,
    live: automations.filter((automation) => automation.status === "ACTIVE").length,
    drafts: automations.filter((automation) => automation.status === "DRAFT").length,
    paused: automations.filter((automation) => automation.status === "PAUSED").length,
  };
}

function time(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortAutomations<T extends Groupable>(automations: readonly T[], sort: AutomationSort, replies?: ReadonlyMap<string, number>): T[] {
  const byName = (left: T, right: T) => left.name.localeCompare(right.name, "en-IN", { sensitivity: "base" });
  const list = [...automations];
  switch (sort) {
    case "name": return list.sort(byName);
    case "newest": return list.sort((left, right) => time(right.createdAt) - time(left.createdAt) || byName(left, right));
    case "replies": return list.sort((left, right) => (replies?.get(right.id) ?? 0) - (replies?.get(left.id) ?? 0) || time(right.updatedAt) - time(left.updatedAt));
    case "recent": return list.sort((left, right) => time(right.updatedAt) - time(left.updatedAt) || byName(left, right));
  }
}

export type AutomationGroup<T> = { key: AutomationGroupKey; label: string; items: T[] };

/**
 * Live automations with a problem lead in their own group; the rest fall into
 * Live, Drafts and Paused. Empty groups are dropped. A tab narrows to its
 * status, and the Live tab still pins broken live automations on top, since
 * they are live too.
 */
export function groupAutomations<T extends { status: string }>(
  automations: readonly T[],
  view: AutomationView,
  needsAttention: (automation: T) => boolean,
): AutomationGroup<T>[] {
  const buckets: Record<AutomationGroupKey, T[]> = { attention: [], live: [], drafts: [], paused: [] };
  for (const automation of automations) {
    if (!matchesAutomationView(automation, view)) continue;
    if (automation.status === "ACTIVE" && needsAttention(automation)) buckets.attention.push(automation);
    else if (automation.status === "ACTIVE") buckets.live.push(automation);
    else if (automation.status === "DRAFT") buckets.drafts.push(automation);
    else buckets.paused.push(automation);
  }
  return (Object.keys(buckets) as AutomationGroupKey[])
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, label: AUTOMATION_GROUP_LABELS[key], items: buckets[key] }));
}
