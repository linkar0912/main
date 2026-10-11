import { notFound } from "next/navigation";
import { AutomationActivity } from "@/src/components/automation-activity";
import { InsightsPanel } from "@/src/components/insights-panel";

export const metadata = { title: "Automation activity · Linkar (preview)" };

/**
 * Dev-only mirror of app/(app)/automations/[id]/activity: the feed under the
 * shared preview header. Try auto_diwali_sale (Instagram) or auto_fb_details
 * (Facebook).
 */
export default async function AutomationActivityPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { id } = await params;
  return (
    <div className="campaign-analytics-page auto-activity-tab">
      <AutomationActivity automationId={id} aside={<InsightsPanel automationId={id} showExport={false} />} />
    </div>
  );
}
