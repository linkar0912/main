import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/src/components/app-shell";
import { AutomationActivity } from "@/src/components/automation-activity";
import { InsightsPanel } from "@/src/components/insights-panel";

export default async function AutomationActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <div className="page-wrap narrow-wrap">
        <Link className="back-link" href="/automations"><ArrowLeft size={16} /> Back to automations</Link>
        <header className="page-header">
          <div>
            <p className="eyebrow">Workspace / automations / activity</p>
            <h1>Campaign activity</h1>
            <p className="muted page-lede">See who matched your Reel comment trigger, whether they followed, and what was delivered.</p>
          </div>
        </header>
        <AutomationActivity automationId={id} />
        <InsightsPanel automationId={id} />
      </div>
    </AppShell>
  );
}
