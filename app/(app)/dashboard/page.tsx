import { DashboardScreen } from "@/src/components/dashboard-screen";
import { getRequestSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

const TIMESERIES_DAYS = 14;

// force-dynamic is required: reading the session means reading server env,
// and production env validation must run at request time, not during the
// build's prerender pass (same reason /login is force-dynamic).
export const dynamic = "force-dynamic";

// Home is server-rendered with its data in the HTML instead of fetching it
// after hydration: one parallel batch of repository calls on the server rather
// than four post-paint API round trips from the browser. Without a session
// (proxy should already have redirected, and demo deployments without Supabase)
// the screen renders unfetched exactly as it did before this change.
export default async function DashboardPage() {
  const session = await getRequestSession();
  if (!session) return <DashboardScreen />;

  const repository = getRepository();
  const [automations, participantsPerDay, sentPerDay, capturedEmails, optedOut, connections, pages] =
    await Promise.all([
      repository.listAutomations(session.workspaceId),
      repository.countParticipantsPerDay(session.workspaceId, TIMESERIES_DAYS, undefined),
      repository.countExecutionsSentPerDay(session.workspaceId, TIMESERIES_DAYS, undefined),
      repository.countCapturedContacts(session.workspaceId),
      repository.countSuppressedContacts(session.workspaceId),
      repository.listConnections(session.workspaceId).catch(() => []),
      repository.listFacebookPages(session.workspaceId).catch(() => []),
    ]);

  return (
    <DashboardScreen
      initialAutomations={automations}
      initialInsights={{
        timeseries: { days: TIMESERIES_DAYS, participantsPerDay, sentPerDay },
        capturedEmails,
        optedOut,
      }}
      initialHasConnection={connections.length > 0 || pages.length > 0}
    />
  );
}
