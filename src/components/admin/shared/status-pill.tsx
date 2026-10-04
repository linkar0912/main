const TONES: Record<string, "ok" | "warn" | "bad" | "idle"> = {
  active: "ok", connected: "ok", sent: "ok", completed: "ok", processed: "ok", available: "ok", ready: "ok", success: "ok", healthy: "ok",
  pending: "warn", queued: "warn", running: "warn", claimed: "warn", received: "warn", attempt: "warn", cancelling: "warn", unknown: "warn", drifted: "warn", deletion_pending: "warn",
  suspended: "bad", failed: "bad", failure: "bad", expired: "bad", revoked: "bad", unavailable: "bad",
};

/** One badge for every record state in the owner console. */
export function StatusPill({ status, label }: { status: string; label?: string }) {
  const key = status.toLowerCase();
  return <span className={`status-pill is-${TONES[key] ?? "idle"}`}>{label ?? key.replaceAll("_", " ")}</span>;
}
