import { DashboardScreen } from "@/src/components/dashboard-screen";
import { getRequestSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

// force-dynamic is required: reading the session means reading server env,
// and production env validation must run at request time, not during the
// build's prerender pass (same reason /login is force-dynamic).
export const dynamic = "force-dynamic";

// Render the useful automation list with the first response. The slower
// analytics queries load within the chart after hydration instead of holding
// the entire page behind the slowest query in a seven-query batch.
export default async function DashboardPage() {
  const session = await getRequestSession();
  if (!session) return <DashboardScreen />;

  const repository = getRepository();
  const automations = await repository.listAutomations(session.workspaceId);

  return (
    <DashboardScreen
      // Server-known identity so "Hello, <name>!" paints with the first HTML
      // instead of waiting on the client bootstrap round trip.
      initialEmail={session.email}
      initialAutomations={automations}
    />
  );
}
