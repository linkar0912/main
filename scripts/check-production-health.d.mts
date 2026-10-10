export type ProductionHealthResult = { ok: true; release: string | null };

export function checkProductionHealth(options: {
  url: string;
  fetch?: typeof globalThis.fetch;
  attempts?: number;
  wait?: () => Promise<void>;
  timeoutMs?: number;
  /** Sent as x-health-token so /api/health returns its detail view. */
  detailToken?: string;
  /** Requires both the web and the worker to report this commit. */
  expectedRelease?: string;
}): Promise<ProductionHealthResult>;
