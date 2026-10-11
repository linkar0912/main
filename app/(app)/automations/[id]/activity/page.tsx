import { notFound } from "next/navigation";
import { AutomationActivity } from "@/src/components/automation-activity";
import { InsightsPanel } from "@/src/components/insights-panel";
import { loadAutomation } from "../load-automation";

export const metadata = { title: "Automation activity · Linkar" };

// Reads the session (see (sections)/page.tsx).
export const dynamic = "force-dynamic";

/**
 * The Activity tab. The shared [id] layout draws the header (name, status,
 * Export CSV, Edit); this is only the feed and its funnel.
 */
export default async function AutomationActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // undefined = the lookup itself failed (keep the generic page); null = no
  // such automation in this workspace (unknown or another tenant's id).
  const { session, automation } = await loadAutomation(id);
  if (session && automation === null) notFound();
  return (
    <div className="campaign-analytics-page auto-activity-tab">
      <AutomationActivity automationId={id} aside={<InsightsPanel automationId={id} showExport={false} />} />
    </div>
  );
}
