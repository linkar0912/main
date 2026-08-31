import type { AdminQueueSnapshot } from "@/src/lib/queue";
export type AdminProbeState = "healthy" | "degraded" | "unavailable";
export type AdminProbe = { state: AdminProbeState; detail?: string };
export type AdminSystemSnapshot = { overall: "healthy" | "degraded"; generatedAt: string; release: string | null; web: AdminProbe; database: AdminProbe; redis: AdminProbe; worker: AdminProbe; queues: AdminQueueSnapshot[]; stuckClaims: number | null; webhookThroughput: { lastHour: number | null }; deletionJobs: { queued: number | null; running: number | null; failed: number | null }; configurationPresence: Array<{ requirement: string; present: boolean }>; reconciliation: { expiredDeliveryClaims: number | null }; rateLimits: AdminProbe };
