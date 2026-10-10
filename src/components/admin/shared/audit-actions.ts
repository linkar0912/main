// Audit events store a stable machine key ("workspace.suspend"). Operators read
// the sentence. Keys come from requireAdminWrite/appendAdminAuditEvent callers
// under app/api/admin and src/lib; anything new falls back to a readable form.

const SENTENCES: Record<string, string> = {
  "audit.export": "Exported the audit log",

  "billing.checkout.create": "Started a checkout",
  "billing.plan.change": "Changed a billing plan",
  "billing.subscription.cancel": "Cancelled a subscription",
  "billing.subscription.lapse": "A subscription lapsed",
  "billing.webhook.apply": "Applied a billing update from Razorpay",

  "deletion.preview": "Previewed a permanent deletion",
  "deletion.create": "Queued a permanent deletion",
  "deletion.cancel": "Cancelled a permanent deletion",
  "deletion.retry": "Retried a permanent deletion",
  "synthetic_cleanup.preview": "Previewed the test-account cleanup",
  "synthetic_cleanup.create": "Queued the test-account cleanup",

  "integration.refresh_token": "Refreshed a connected account's access",
  "integration.mark_expired": "Marked a connected account as expired",
  "integration.repair_subscription": "Repaired a connected account's event subscription",
  "integration.prepare_disconnect": "Started disconnecting an account",
  "integration.disconnect": "Disconnected an account",

  "plan.create": "Created a plan",
  "plan.update": "Edited a plan",
  "plan.retire": "Retired a plan",
  "premium_invite.create": "Created an invite code",
  "premium_invite.revoke": "Revoked an invite code",
  "premium_invite.end_access": "Ended access from an invite code",

  "security.factor.enroll": "Started adding a two-factor app",
  "security.factor.verify": "Verified two-factor sign-in",
  "security.factor.prepare_unenroll": "Started removing a two-factor app",
  "security.factor.unenroll": "Removed a two-factor app",

  "system.queue.pause": "Paused a job queue",
  "system.queue.resume": "Resumed a job queue",
  "system.queue.retry_failed_jobs": "Retried failed background jobs",
  "system.run_delivery_reconciliation": "Re-checked stuck message deliveries",
  "system.run_usage_reconciliation": "Recounted plan usage",

  "user.invite": "Invited a user",
  "user.create": "Created a user account",
  "user.update": "Edited a user",
  "user.password_reset": "Sent a password reset",
  "user.access.suspend": "Suspended a user's access",
  "user.access.restore": "Restored a user's access",
  "user.access.revoke_linkar_sessions": "Signed a user out everywhere",
  "user.access.ban": "Blocked a user from signing in",
  "user.access.unban": "Let a user sign in again",
  "user.membership.add": "Added a user to a workspace",
  "user.membership.change_role": "Changed a user's workspace role",
  "user.membership.remove": "Removed a user from a workspace",

  "workspace.create": "Created a workspace",
  "workspace.update": "Edited a workspace",
  "workspace.inspect": "Opened a workspace",
  "workspace.export": "Exported a workspace's data",
  "workspace.delete": "Deleted a workspace",
  "workspace.suspend": "Suspended a workspace",
  "workspace.restore": "Restored a workspace",
  "workspace.entitlement.update": "Changed a workspace's plan or limits",
  "workspace.automations.pause_all": "Paused a workspace's automations",
  "workspace.automations.resume_paused": "Resumed a workspace's paused automations",
  "workspace.member.add": "Added a workspace member",
  "workspace.member.change_role": "Changed a member's role",
  "workspace.member.transfer_ownership": "Transferred workspace ownership",
  "workspace.member.remove": "Removed a workspace member",
};

// Record commands are keyed "operation.<kind>.<action>".
const RECORD_NOUNS: Record<string, string> = {
  automation: "an automation",
  sequence: "a sequence",
  broadcast: "a broadcast",
  contact: "a contact",
  tracked_link: "a tracked link",
  delivery: "a message delivery",
  webhook: "an incoming Meta event",
};
const RECORD_VERBS: Record<string, string> = {
  activate: "Turned on",
  pause: "Paused",
  archive: "Archived",
  update: "Edited",
  restore_version: "Restored an earlier version of",
  cancel_pending: "Cancelled unsent messages for",
  retry_failed: "Retried failed sends for",
  suppress: "Stopped messages to",
  unsuppress: "Allowed messages to",
  delete: "Deleted",
  export_one: "Exported",
  disable: "Turned off",
  enable: "Turned on",
  retry: "Retried",
  release_stale_claim: "Released a stuck send on",
  reprocess: "Replayed",
};

/** "security.factor.verify" -> "Security factor verify". */
export function humanizeActionKey(action: string): string {
  const text = action.split(/[._:]+/).filter(Boolean).join(" ").toLowerCase();
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "Unknown action";
}

/** The plain sentence an operator reads for an audit action key. */
export function describeAuditAction(action: string): string {
  const key = action.trim();
  if (SENTENCES[key]) return SENTENCES[key];
  const record = /^operation\.([a-z_]+)\.([a-z_]+)$/.exec(key);
  const noun = record ? RECORD_NOUNS[record[1]] : undefined;
  if (record && noun && record[2] === "update_destination") return `Changed where ${noun} points`;
  if (record && noun && RECORD_VERBS[record[2]]) return `${RECORD_VERBS[record[2]]} ${noun}`;
  return humanizeActionKey(key);
}

/** Every key with a hand-written sentence, for tests and the audit filter. */
export const KNOWN_AUDIT_ACTIONS = Object.keys(SENTENCES);
