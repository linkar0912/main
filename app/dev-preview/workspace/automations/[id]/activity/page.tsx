import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Pencil } from "lucide-react";
import { AutomationActivity } from "@/src/components/automation-activity";
import { InsightsPanel } from "@/src/components/insights-panel";
import { PageHeader } from "@/src/components/page-header";
import { StatusBadge } from "@/src/components/status-badge";
import { automations } from "../../../_preview/fixtures";

export const metadata = { title: "Campaign performance · Linkar (preview)" };

/**
 * Dev-only mirror of app/(app)/automations/[id]/activity: the same header and
 * screen, with the automation looked up in the fixtures instead of the
 * repository. Try auto_diwali_sale (Instagram) or auto_fb_details (Facebook).
 */
export default async function AutomationActivityPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { id } = await params;
  const automation = automations().find((candidate) => candidate.id === id);
  if (!automation) notFound();
  return (
    <div className="page-wrap ws-page campaign-analytics-page">
      <PageHeader
        back={<Link className="back-link" href="/dev-preview/workspace/automations"><ArrowLeft size={15} /> Back to automations</Link>}
        title={<span className="campaign-title">{automation.name} <StatusBadge status={automation.status} /></span>}
        description={automation.provider === "FACEBOOK" || automation.facebookPageId
          ? "Every comment this automation answered on your Facebook Page."
          : "Campaign performance: from comment to delivered link."}
        actions={(
          <>
            <a className="button button-secondary" href={`/api/insights/export?automationId=${encodeURIComponent(id)}`} download>
              <Download size={15} /> Export CSV
            </a>
            <Link className="button button-primary" href={`/dev-preview/workspace/automations/${id}/edit`}><Pencil size={15} /> Edit automation</Link>
          </>
        )}
      />
      <AutomationActivity automationId={id} aside={<InsightsPanel automationId={id} showExport={false} />} />
    </div>
  );
}
