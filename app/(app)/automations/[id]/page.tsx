import { AutomationOverviewScreen } from "@/src/components/automation-overview";
import { parseRange } from "@/src/lib/analytics-range";
import { loadAutomation } from "./load-automation";

export const metadata = { title: "Automation · Linkar" };

// Reads the session (see (sections)/page.tsx); the layout already 404s an
// automation from another workspace.
export const dynamic = "force-dynamic";

export default async function AutomationOverviewPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  /** `?range=7|14|30`: the analytics window the Overview opens on. */
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { automation } = await loadAutomation(id);
  const initialRange = parseRange(Array.isArray(query.range) ? query.range[0] : query.range);
  return <AutomationOverviewScreen automationId={id} initialAutomation={automation ?? undefined} initialRange={initialRange} />;
}
