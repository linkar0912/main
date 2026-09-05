import "server-only";

import { dispatchConfiguredIncidentAlerts } from "./alerts";
import { evaluateSystemIncidents, prismaIncidentRepository, reconcileSystemIncidents } from "./incidents";
import { getAdminSystemService } from "./service";

export function createSystemMonitor(dependencies: {
  snapshot: () => Promise<Awaited<ReturnType<ReturnType<typeof getAdminSystemService>["snapshot"]>>>;
  evaluate: typeof evaluateSystemIncidents;
  reconcile: typeof reconcileSystemIncidents;
  dispatch: typeof dispatchConfiguredIncidentAlerts;
  now: () => Date;
} = {
  snapshot: () => getAdminSystemService().snapshot(),
  evaluate: evaluateSystemIncidents,
  reconcile: reconcileSystemIncidents,
  dispatch: dispatchConfiguredIncidentAlerts,
  now: () => new Date(),
}) {
  let running = false;
  return {
    async run() {
      if (running) return { skipped: true } as const;
      running = true;
      try {
        const now = dependencies.now();
        const snapshot = await dependencies.snapshot();
        const candidates = dependencies.evaluate(snapshot, now);
        const lifecycle = await dependencies.reconcile(candidates, prismaIncidentRepository, now);
        const alerts = await dependencies.dispatch(now);
        return { skipped: false, candidates: candidates.length, lifecycleChanges: lifecycle.length, alertsDelivered: alerts.delivered } as const;
      } finally {
        running = false;
      }
    },
  };
}
