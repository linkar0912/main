import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/src/components/app-shell";
import { AutomationActivity } from "@/src/components/automation-activity";
import { InsightsPanel } from "@/src/components/insights-panel";

export default async function AutomationActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <div className="page-wrap">
        <Link className="back-link" href="/automations"><ArrowLeft size={16} /> Back to automations</Link>
        <header className="page-header">
          <div>
            <p className="eyebrow">Workspace / Automations / Campaign activity</p>
            <h1>Campaign activity</h1>
            <p className="muted page-lede">
              Every person who hit your trigger — where they are in the journey, what was delivered,
              and how the campaign converts.
            </p>
          </div>
        </header>
        <div className="activity-layout">
          <div className="activity-main">
            <AutomationActivity automationId={id} />
          </div>
          <aside className="activity-side" aria-label="Campaign insights">
            <InsightsPanel automationId={id} />
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
