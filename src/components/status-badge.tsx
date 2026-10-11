import type { AutomationStatus, ConnectionStatus } from "@/src/lib/repository";
import { StatusBadge as SharedStatusBadge, type StatusTone } from "@/src/components/ui/status-badge";

type Status = AutomationStatus | ConnectionStatus;

// Live and connected are the normal state, so they stay quiet; paused and
// draft are deliberate choices, not problems; only a lost connection is loud.
const STATES: Record<Status, [StatusTone, string]> = {
  ACTIVE: ["success", "Active"],
  PAUSED: ["neutral", "Paused"],
  DRAFT: ["neutral", "Draft"],
  CONNECTED: ["success", "Connected"],
  DISCONNECTED: ["danger", "Disconnected"],
  EXPIRED: ["danger", "Expired"],
};

export function StatusBadge({ status }: { status: Status }) {
  const [tone, label] = STATES[status] ?? ["neutral", status.charAt(0) + status.slice(1).toLowerCase()];
  return <SharedStatusBadge tone={tone} label={label} />;
}
