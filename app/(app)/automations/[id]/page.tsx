import { AutomationOverviewScreen } from "@/src/components/automation-overview";
import { loadAutomation } from "./load-automation";

export const metadata = { title: "Automation · Linkar" };

// Reads the session (see (sections)/page.tsx); the layout already 404s an
// automation from another workspace.
export const dynamic = "force-dynamic";

export default async function AutomationOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { automation } = await loadAutomation(id);
  return <AutomationOverviewScreen automationId={id} initialAutomation={automation ?? undefined} />;
}
