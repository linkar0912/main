export type ProductionHealthResult = { ok: true; release: string | null };

export function checkProductionHealth(options: {
  url: string;
  fetch?: typeof globalThis.fetch;
  attempts?: number;
  wait?: () => Promise<void>;
  timeoutMs?: number;
}): Promise<ProductionHealthResult>;
