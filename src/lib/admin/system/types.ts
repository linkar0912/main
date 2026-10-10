import type { AdminQueueSnapshot } from "@/src/lib/queue";

export type AdminProbeState = "healthy" | "degraded" | "unavailable";
export type AdminProbe = {
  state: AdminProbeState;
  detail?: string;
  /** Worker only: the release the worker reported in its last heartbeat. */
  release?: string | null;
  /** Worker only: when the last heartbeat was written. */
  lastSeenAt?: string | null;
};

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
  operationalDataAvailable?: boolean;
  /** `fix` says, in plain words, which settings to add when a requirement is missing. */
  configurationPresence: Array<{ requirement: string; present: boolean; fix?: string }>;
  capabilities: { followGatedCampaigns: "enabled" | "disabled" };
  reconciliation: { expiredDeliveryClaims: number | null };
  rateLimits: AdminProbe;
};
