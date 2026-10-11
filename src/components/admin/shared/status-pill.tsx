import { StatusBadge, type StatusTone } from "@/src/components/ui/status-badge";

// Record states arrive as enum values (ACTIVE, DELETION_PENDING, drifted).
// Each maps to one tone and one plain word.
const STATES: Record<string, [StatusTone, string]> = {
  active: ["success", "Active"],
  connected: ["success", "Connected"],
  sent: ["success", "Sent"],
  completed: ["success", "Completed"],
  processed: ["success", "Processed"],
  available: ["success", "Available"],
  ready: ["success", "Ready"],
  success: ["success", "Succeeded"],
  healthy: ["success", "Healthy"],
  running: ["neutral", "Running"],
  pending: ["warning", "Pending"],
  queued: ["neutral", "Queued"],
  claimed: ["neutral", "Sending"],
  received: ["neutral", "Received"],
  attempt: ["neutral", "Started"],
  cancelling: ["warning", "Cancelling"],
  unknown: ["warning", "Unknown"],
  drifted: ["warning", "Needs repair"],
  deletion_pending: ["warning", "Deletion pending"],
  paused: ["neutral", "Paused"],
  draft: ["neutral", "Draft"],
  unchecked: ["neutral", "Not checked"],
  disabled: ["neutral", "Turned off"],
  suppressed: ["neutral", "Opted out"],
  cancelled: ["neutral", "Cancelled"],
  used: ["neutral", "Used"],
  retired: ["neutral", "Retired"],
  suspended: ["danger", "Suspended"],
  failed: ["danger", "Failed"],
  failure: ["danger", "Failed"],
  expired: ["danger", "Expired"],
  revoked: ["danger", "Revoked"],
  unavailable: ["danger", "Unavailable"],
  disconnected: ["danger", "Disconnected"],
};

export function statusLabel(status: string): string {
  const key = status.toLowerCase();
  if (STATES[key]) return STATES[key][1];
  const words = key.replaceAll("_", " ");
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : "Unknown";
}

export function statusTone(status: string): StatusTone {
  return STATES[status.toLowerCase()]?.[0] ?? "neutral";
}

/** One badge for every record state in the owner console. */
export function StatusPill({ status, label, tone }: { status: string; label?: string; tone?: StatusTone }) {
  return <StatusBadge tone={tone ?? statusTone(status)} label={label ?? statusLabel(status)} />;
}
