import "server-only";

import { prisma } from "@/src/lib/prisma";

export type IncidentSeverity = "WARNING" | "CRITICAL";
export type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export type SystemIncidentCandidate = {
  fingerprint: string;
  source: string;
  title: string;
  detail: string;
  severity: IncidentSeverity;
};

export type ActiveIncident = {
  id: string;
  fingerprint: string;
  severity: IncidentSeverity;
  status: Exclude<IncidentStatus, "RESOLVED">;
};

export type IncidentLifecycleEvent = {
  kind: "OPENED" | "ESCALATED" | "RESOLVED";
  incident: Record<string, unknown> & { id: string };
};

type IncidentSnapshot = {
  generatedAt: string;
  web: { state: string; detail?: string };
  database: { state: string; detail?: string };
  redis: { state: string; detail?: string };
  worker: { state: string; detail?: string };
  queues: Array<{
    name: string;
    configured: boolean;
    paused: boolean | null;
    waiting: number;
    failed: number;
    oldestWaitingAgeMs: number | null;
    active?: number;
    delayed?: number;
    completed?: number;
    lastFailedCode?: string | null;
  }>;
  stuckClaims: number | null;
  deletionJobs: { failed: number | null };
  billing: { configured: boolean; failedWebhooksLastHour: number | null; driftedSubscriptions: number | null };
};

const severityRank: Record<IncidentSeverity, number> = { WARNING: 1, CRITICAL: 2 };

function candidate(
  fingerprint: string,
  source: string,
  title: string,
  detail: string,
  severity: IncidentSeverity,
): SystemIncidentCandidate {
  return { fingerprint, source, title, detail: detail.slice(0, 300), severity };
}

export function evaluateSystemIncidents(snapshot: IncidentSnapshot, now = new Date()): SystemIncidentCandidate[] {
  const incidents: SystemIncidentCandidate[] = [];
  const components = [
    ["web", "Web application", snapshot.web],
    ["database", "Database", snapshot.database],
    ["redis", "Redis", snapshot.redis],
    ["worker", "Background worker", snapshot.worker],
  ] as const;

  for (const [key, title, probe] of components) {
    if (probe.state === "unavailable") {
      incidents.push(candidate(`component:${key}:unavailable`, `component:${key}`, `${title} unavailable`, "The bounded health probe did not succeed.", "CRITICAL"));
    } else if (probe.state === "degraded") {
      incidents.push(candidate(`component:${key}:degraded`, `component:${key}`, `${title} degraded`, "The component reported a degraded state.", "WARNING"));
    }
  }

  const generatedAt = Date.parse(snapshot.generatedAt);
  if (!Number.isFinite(generatedAt) || now.getTime() - generatedAt > 60_000) {
    incidents.push(candidate("system:snapshot:stale", "system", "System snapshot is stale", "The latest system snapshot is more than one minute old.", "WARNING"));
  }

  for (const queue of snapshot.queues) {
    const source = `queue:${queue.name}`;
    if (queue.configured && queue.paused) {
      incidents.push(candidate(`${source}:paused`, source, `${queue.name} queue paused`, "Queue processing is paused.", "WARNING"));
    }
    const criticalBacklog = queue.waiting >= 500 || (queue.oldestWaitingAgeMs ?? 0) >= 30 * 60_000;
    const warningBacklog = queue.waiting >= 100 || (queue.oldestWaitingAgeMs ?? 0) >= 10 * 60_000;
    if (criticalBacklog || warningBacklog) {
      incidents.push(candidate(`${source}:backlog`, source, `${queue.name} queue backlog`, `${queue.waiting} jobs are waiting.`, criticalBacklog ? "CRITICAL" : "WARNING"));
    }
    if (queue.failed > 0) {
      incidents.push(candidate(`${source}:failed`, source, `${queue.name} queue failures`, `${queue.failed} jobs are currently failed.`, queue.failed >= 25 ? "CRITICAL" : "WARNING"));
    }
  }

  if ((snapshot.stuckClaims ?? 0) > 0) {
    incidents.push(candidate("deliveries:expired-claims", "deliveries", "Expired delivery claims", `${snapshot.stuckClaims} delivery claims require reconciliation.`, (snapshot.stuckClaims ?? 0) >= 25 ? "CRITICAL" : "WARNING"));
  }
  if ((snapshot.deletionJobs.failed ?? 0) > 0) {
    incidents.push(candidate("deletions:failed", "deletions", "Deletion jobs failed", `${snapshot.deletionJobs.failed} deletion jobs need operator review.`, "WARNING"));
  }
  if (!snapshot.billing.configured) {
    incidents.push(candidate("billing:configuration", "billing", "Razorpay is not configured", "Required production billing values are missing.", "CRITICAL"));
  }
  if ((snapshot.billing.failedWebhooksLastHour ?? 0) > 0) {
    incidents.push(candidate("billing:webhooks:failed", "billing", "Razorpay webhook processing failed", `${snapshot.billing.failedWebhooksLastHour} billing webhooks failed in the last hour.`, "CRITICAL"));
  }
  if ((snapshot.billing.driftedSubscriptions ?? 0) > 0) {
    incidents.push(candidate("billing:subscriptions:drift", "billing", "Billing subscriptions need reconciliation", `${snapshot.billing.driftedSubscriptions} subscriptions have stale provider state.`, "WARNING"));
  }

  return incidents.sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
}

export interface IncidentRepository {
  listActive(): Promise<ActiveIncident[]>;
  open(candidate: SystemIncidentCandidate, now: Date): Promise<Record<string, unknown> & { id: string }>;
  refresh(id: string, candidate: SystemIncidentCandidate, now: Date, escalated?: boolean): Promise<Record<string, unknown> & { id: string }>;
  resolve(id: string, now: Date): Promise<Record<string, unknown> & { id: string }>;
}

export async function reconcileSystemIncidents(
  candidates: SystemIncidentCandidate[],
  repository: IncidentRepository,
  now = new Date(),
): Promise<IncidentLifecycleEvent[]> {
  const active = await repository.listActive();
  const activeByFingerprint = new Map(active.map((incident) => [incident.fingerprint, incident]));
  const seen = new Set<string>();
  const events: IncidentLifecycleEvent[] = [];

  for (const next of candidates) {
    if (seen.has(next.fingerprint)) continue;
    seen.add(next.fingerprint);
    const current = activeByFingerprint.get(next.fingerprint);
    if (!current) {
      events.push({ kind: "OPENED", incident: await repository.open(next, now) });
      continue;
    }
    const escalated = severityRank[next.severity] > severityRank[current.severity];
    const incident = await repository.refresh(current.id, next, now, escalated);
    if (escalated) {
      events.push({ kind: "ESCALATED", incident });
    }
  }

  for (const current of active) {
    if (!seen.has(current.fingerprint)) {
      events.push({ kind: "RESOLVED", incident: await repository.resolve(current.id, now) });
    }
  }
  return events;
}

export const prismaIncidentRepository: IncidentRepository = {
  async listActive() {
    const rows = await prisma.adminIncident.findMany({
      where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      select: { id: true, fingerprint: true, severity: true, status: true },
    });
    return rows.map((row) => ({ ...row, status: row.status as ActiveIncident["status"] }));
  },
  open(next, now) {
    return prisma.adminIncident.create({
      data: { ...next, activeKey: next.fingerprint, firstSeenAt: now, lastSeenAt: now },
    });
  },
  refresh(id, next, now, escalated = false) {
    return prisma.adminIncident.update({
      where: { id },
      data: {
        source: next.source,
        title: next.title,
        detail: next.detail,
        severity: next.severity,
        lastSeenAt: now,
        occurrenceCount: { increment: 1 },
        ...(escalated ? { notificationSentAt: null } : {}),
      },
    });
  },
  resolve(id, now) {
    return prisma.adminIncident.update({
      where: { id },
      data: { status: "RESOLVED", activeKey: null, resolvedAt: now, lastSeenAt: now },
    });
  },
};
