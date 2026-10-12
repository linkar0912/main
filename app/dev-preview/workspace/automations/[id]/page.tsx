import { notFound } from "next/navigation";
import { AutomationOverviewScreen } from "@/src/components/automation-overview";
import { parseRange } from "@/src/lib/analytics-range";
import { automations } from "../../_preview/fixtures";

export const metadata = { title: "Automation · Linkar (preview)" };

/**
 * Dev-only: the Overview tab for a fixture automation. auto_diwali_sale has
 * the funnel and top posts, auto_price_list a failed delivery,
 * auto_bridal_consult (a draft) no data yet; ?state=empty empties any of them.
 */
export default async function AutomationOverviewPreviewPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const [{ id }, { range }] = await Promise.all([params, searchParams]);
  const automation = automations().find((candidate) => candidate.id === id);
  if (!automation) notFound();
  return <AutomationOverviewScreen automationId={id} initialAutomation={automation} basePath="/dev-preview/workspace/automations" initialRange={parseRange(range)} />;
}
