"use client";

import { useEffect, useState } from "react";
import { getFacebookPages, getInstagramConnections } from "@/src/lib/client/workspace-data";
import { requestDeliveryProblems, type DeliveryProblem } from "./delivery-diagnostics";
import type { AutomationConnections, AutomationRowStats } from "./automation-list";

/**
 * The three signals the Automations list and an automation's Overview read
 * besides the automation itself: which accounts are connected, which
 * messages failed recently, and how many replies each automation sent.
 * Each one stays null until it is known, so nothing claims "not connected"
 * or "no replies" before the answer arrives.
 */

/** Instagram accounts and Facebook Pages, from the shared workspace cache. */
export function useWorkspaceConnections(): AutomationConnections | null {
  const [connections, setConnections] = useState<AutomationConnections | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([getInstagramConnections(), getFacebookPages()])
      .then(([instagram, facebook]) => {
        if (active) setConnections({ instagram, facebook });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return connections;
}

/** Recent delivery problems; an empty list when the request fails (nothing to flag). */
export function useDeliveryProblems(enabled = true): DeliveryProblem[] | null {
  const [problems, setProblems] = useState<DeliveryProblem[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    requestDeliveryProblems(100, controller.signal)
      .then((data) => setProblems(data))
      .catch(() => {
        if (!controller.signal.aborted) setProblems([]);
      });
    return () => controller.abort();
  }, [enabled]);
  return problems;
}

type InsightsOutcomes = { automations?: Array<{ automationId: string; sent: number; failed: number }> };

// One request per range answers every row; switching back to a range already
// seen paints from here instead of blanking the stats line.
const statsByRange = new Map<number, Map<string, AutomationRowStats>>();

/** Test isolation helper. */
export function clearAutomationStatsCache(): void {
  statsByRange.clear();
}

/**
 * Replies (sent messages) and failures per automation over the last `days`
 * days, from the per-automation outcomes /api/insights already returns.
 */
export function useAutomationStats(days: number, enabled = true): { days: number; stats: Map<string, AutomationRowStats> } | null {
  const [loaded, setLoaded] = useState<{ days: number; stats: Map<string, AutomationRowStats> } | null>(() => {
    const cached = statsByRange.get(days);
    return cached ? { days, stats: cached } : null;
  });
  useEffect(() => {
    if (!enabled || statsByRange.has(days)) return;
    const controller = new AbortController();
    fetch(`/api/insights?days=${days}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Insights unavailable");
        const payload = (await response.json()) as InsightsOutcomes;
        const stats = new Map((payload.automations ?? []).map((row) => [row.automationId, { sent: row.sent, failed: row.failed }]));
        statsByRange.set(days, stats);
        setLoaded({ days, stats });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [days, enabled]);
  // A range seen before paints straight from the cache; otherwise the previous
  // range's numbers (labelled with their own range) stay until the new ones land.
  const cached = statsByRange.get(days);
  if (cached && loaded?.days !== days) return { days, stats: cached };
  return loaded;
}
