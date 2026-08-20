import type { AutomationStatus, ConnectionStatus } from "@/src/lib/repository";

type Status = AutomationStatus | ConnectionStatus;

export function StatusBadge({ status }: { status: Status }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return <span className={`status-badge status-${status.toLowerCase()}`}>{label}</span>;
}
