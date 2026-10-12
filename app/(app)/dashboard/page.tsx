import { DashboardScreen } from "@/src/components/dashboard-screen";
import { getRequestSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import { parseRange } from "@/src/lib/analytics-range";

export const metadata = { title: "Home · Linkar" };

// force-dynamic is required: reading the session means reading server env,
// and production env validation must run at request time, not during the
// build's prerender pass (same reason /login is force-dynamic).
export const dynamic = "force-dynamic";

type DashboardPageProps = {
  /** `?range=7|14|30`: the window the numbers card opens on. */
  searchParams?: Promise<{ range?: string | string[] }>;
};

// Render the useful automation list with the first response. The slower
// analytics queries load within the chart after hydration instead of holding
// the entire page behind the slowest query in a seven-query batch.
export default async function DashboardPage({ searchParams }: DashboardPageProps = {}) {
  const query = (await searchParams) ?? {};
  // Only 7, 14 or 30; anything else opens on the remembered or default window.
  const initialRange = parseRange(Array.isArray(query.range) ? query.range[0] : query.range);
  const session = await getRequestSession();
  if (!session) return <DashboardScreen initialRange={initialRange} />;

  const repository = getRepository();
  // A failed query falls back to the client fetch instead of failing the page
  // (same as automations (sections)/page.tsx).
  const automations = await repository.listAutomations(session.workspaceId).catch(() => undefined);

  return (
    <DashboardScreen
      // Server-known identity so "Hello, <name>!" paints with the first HTML
      // instead of waiting on the client bootstrap round trip.
      initialEmail={session.email}
      initialAutomations={automations}
      initialRange={initialRange}
    />
  );
}
