import { logger } from "./logger";

const ALLOWED_TIMING_NAMES = [
  "workspace.bootstrap.repository",
  "workspace.bootstrap.avatar",
  "instagram.connections.repository",
  "instagram.connections.avatars",
  "facebook.connections.repository",
  "billing.view.service",
] as const;

export type AllowedTimingName = (typeof ALLOWED_TIMING_NAMES)[number];

const allowedTimingNames = new Set<string>(ALLOWED_TIMING_NAMES);

/**
 * Measures only allowlisted server boundaries. Callers cannot attach context,
 * which keeps account IDs, email addresses, provider payloads, and tokenized
 * URLs out of timing logs by construction.
 */
export async function measureServerOperation<T>(
  name: AllowedTimingName,
  operation: () => Promise<T>,
  metadata?: never,
): Promise<T> {
  if (!allowedTimingNames.has(name)) throw new Error("Unsupported server timing operation");
  if (metadata !== undefined) throw new Error("Server timing metadata is not accepted");
  const startedAt = performance.now();
  let ok = false;
  try {
    const result = await operation();
    ok = true;
    return result;
  } finally {
    logger.info("server operation timing", {
      operation: name,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      ok,
    });
  }
}
