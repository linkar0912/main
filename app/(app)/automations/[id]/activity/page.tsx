import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Pencil } from "lucide-react";
import { AutomationActivity } from "@/src/components/automation-activity";
import { InsightsPanel } from "@/src/components/insights-panel";
import { PageHeader } from "@/src/components/page-header";
import { StatusBadge } from "@/src/components/status-badge";
import { getRequestSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const metadata = { title: "Campaign performance · Linkar" };

// Reads the session to name the campaign in the header (see (sections)/page.tsx).
export const dynamic = "force-dynamic";

export default async function AutomationActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getRequestSession();
  // undefined = the lookup itself failed (keep the generic header); null = no
  // such automation in this workspace (unknown or another tenant's id), which
  // must not render Export/Edit actions for it.
  const automation = session
    ? await getRepository().getAutomation(session.workspaceId, id).catch(() => undefined)
    : undefined;
  if (session && automation === null) notFound();
  return (
    <div className="page-wrap campaign-analytics-page">
      <PageHeader
        back={<Link className="back-link" href="/automations"><ArrowLeft size={15} /> Back to automations</Link>}
        title={automation ? (
          <span className="campaign-title">{automation.name} <StatusBadge status={automation.status} /></span>
        ) : "Campaign performance"}
        description="Campaign performance: from comment to delivered link."
        actions={(
          <>
            <a className="button button-secondary" href={`/api/insights/export?automationId=${encodeURIComponent(id)}`} download>
              <Download size={15} /> Export CSV
            </a>
            <Link className="button button-primary" href={`/automations/${id}/edit`}><Pencil size={15} /> Edit automation</Link>
          </>
        )}
      />
      <AutomationActivity automationId={id} aside={<InsightsPanel automationId={id} showExport={false} />} />
    </div>
  );
}
