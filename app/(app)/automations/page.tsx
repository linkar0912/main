import { AutomationsScreen } from "@/src/components/automations-screen";
import { getRequestSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

// Server-rendered list: the rows arrive inside the page payload and seed the
// client cache (see seedAutomations in automation-list.tsx), so the first
// paint shows confirmed automations instead of a skeleton that waits on a
// post-hydration /api/automations round trip.
// force-dynamic is required: reading the session means reading server env,
// and production env validation must run at request time, not during the
// build's prerender pass (same reason /login is force-dynamic).
export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const session = await getRequestSession();
  const automations = session
    ? await getRepository().listAutomations(session.workspaceId).catch(() => undefined)
    : undefined;
  return <AutomationsScreen initialAutomations={automations} />;
}
