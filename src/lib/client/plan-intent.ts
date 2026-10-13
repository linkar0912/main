import { invalidateWorkspaceResource } from "./workspace-data";

/**
 * Forgets the plan picked on /pricing (an HttpOnly cookie, so the server
 * clears it). The cached shell payload carries the intent too, so it is
 * dropped as well and the shell never hands over to Billing a second time.
 */
export async function clearPlanIntent(): Promise<void> {
  invalidateWorkspaceResource("bootstrap");
  await fetch("/api/billing/plan-intent", { method: "DELETE" }).catch(() => undefined);
  invalidateWorkspaceResource("bootstrap");
}
