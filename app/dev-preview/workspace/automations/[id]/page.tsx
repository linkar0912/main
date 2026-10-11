import { notFound } from "next/navigation";
import { AutomationOverviewScreen } from "@/src/components/automation-overview";
import { automations } from "../../_preview/fixtures";

export const metadata = { title: "Automation · Linkar (preview)" };

/** Dev-only: the Overview tab for a fixture automation. */
export default async function AutomationOverviewPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { id } = await params;
  const automation = automations().find((candidate) => candidate.id === id);
  if (!automation) notFound();
  return <AutomationOverviewScreen automationId={id} initialAutomation={automation} basePath="/dev-preview/workspace/automations" />;
}
