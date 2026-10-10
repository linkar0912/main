import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { describeAuditAction, humanizeActionKey } from "./audit-actions";

const root = path.resolve(__dirname, "../../../..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const target = path.join(directory, name);
    if (statSync(target).isDirectory()) return sourceFiles(target);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [target] : [];
  });
}

// Every literal audit key written by an admin route or a billing/system job.
function literalActionKeys(): string[] {
  const keys = new Set<string>();
  for (const file of [...sourceFiles(path.join(root, "app/api/admin")), ...sourceFiles(path.join(root, "src/lib"))]) {
    for (const match of readFileSync(file, "utf8").matchAll(/action:\s*"([a-z_]+(?:\.[a-z_]+)+)"/g)) keys.add(match[1]);
  }
  return [...keys];
}

describe("describeAuditAction", () => {
  it("has a hand-written sentence for every audit key in the codebase", () => {
    const keys = literalActionKeys();
    expect(keys.length).toBeGreaterThan(20);
    const missing = keys.filter((key) => describeAuditAction(key) === humanizeActionKey(key));
    expect(missing).toEqual([]);
  });

  it("covers the keys built at runtime", () => {
    const dynamic = [
      "workspace.suspend", "workspace.restore",
      "workspace.member.add", "workspace.member.change_role", "workspace.member.transfer_ownership",
      "user.invite", "user.create",
      "user.access.suspend", "user.access.restore", "user.access.revoke_linkar_sessions", "user.access.ban", "user.access.unban",
      "user.membership.add", "user.membership.change_role", "user.membership.remove",
      "deletion.cancel", "deletion.retry",
      "system.queue.pause", "system.queue.resume", "system.queue.retry_failed_jobs",
      "system.run_delivery_reconciliation", "system.run_usage_reconciliation",
      "integration.refresh_token", "integration.mark_expired", "integration.repair_subscription", "integration.disconnect",
    ];
    expect(dynamic.filter((key) => describeAuditAction(key) === humanizeActionKey(key))).toEqual([]);
  });

  it("reads record commands as sentences", () => {
    expect(describeAuditAction("operation.automation.pause")).toBe("Paused an automation");
    expect(describeAuditAction("operation.delivery.release_stale_claim")).toBe("Released a stuck send on a message delivery");
    expect(describeAuditAction("operation.tracked_link.update_destination")).toBe("Changed where a tracked link points");
  });

  it("uses the owner's examples and humanises unknown keys", () => {
    expect(describeAuditAction("security.factor.verify")).toBe("Verified two-factor sign-in");
    expect(describeAuditAction("premium_invite.create")).toBe("Created an invite code");
    expect(describeAuditAction("workspace.suspend")).toBe("Suspended a workspace");
    expect(describeAuditAction("future.thing_done")).toBe("Future thing done");
  });
});
