import type { AdminOperationKind } from "@/src/lib/admin/operations/types";

export const kindLabels: Record<AdminOperationKind, { plural: string; singular: string }> = {
  automation: { plural: "Automations", singular: "Automation" },
  sequence: { plural: "Sequences", singular: "Sequence" },
  broadcast: { plural: "Broadcasts", singular: "Broadcast" },
  contact: { plural: "Contacts", singular: "Contact" },
  tracked_link: { plural: "Tracked links", singular: "Tracked link" },
  delivery: { plural: "Message deliveries", singular: "Message delivery" },
  webhook: { plural: "Incoming events", singular: "Incoming Meta event" },
};

const actionLabels: Record<string, string> = {
  activate: "Turn on",
  pause: "Pause",
  archive: "Archive",
  update: "Edit",
  restore_version: "Restore a version",
  cancel_pending: "Cancel unsent",
  retry_failed: "Retry failed sends",
  suppress: "Stop messaging",
  unsuppress: "Allow messaging",
  delete: "Delete",
  export_one: "Export",
  update_destination: "Change link",
  disable: "Turn off",
  enable: "Turn on",
  retry: "Retry",
  release_stale_claim: "Release stuck send",
  reprocess: "Replay event",
};

export function actionLabel(action: string): string {
  if (actionLabels[action]) return actionLabels[action];
  const text = action.replaceAll("_", " ");
  return `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;
}
