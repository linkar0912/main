import type { AdminQueueSnapshot } from "@/src/lib/queue";

export type AdminProbeState = "healthy" | "degraded" | "unavailable";
export type AdminProbe = { state: AdminProbeState; detail?: string };

export type AdminIncidentSummary = {
  id: string;
  severity: "WARNING" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  source: string;
  title: string;
  detail: string;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  occurrenceCount: number;
};

export type AdminSystemSnapshot = {
  overall: "healthy" | "degraded";
  generatedAt: string;
  release: string | null;
  web: AdminProbe;
  database: AdminProbe;
  redis: AdminProbe;
  worker: AdminProbe;
  queues: AdminQueueSnapshot[];
  stuckClaims: number | null;
  webhookThroughput: { lastHour: number | null };
  deletionJobs: { queued: number | null; running: number | null; failed: number | null };
  billing: { configured: boolean; failedWebhooksLastHour: number | null; driftedSubscriptions: number | null };
  incidents: AdminIncidentSummary[];
  configurationPresence: Array<{ requirement: string; present: boolean }>;
  capabilities: { followGatedCampaigns: "enabled" | "disabled" };
  reconciliation: { expiredDeliveryClaims: number | null };
  rateLimits: AdminProbe;
};
