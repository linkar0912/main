import Link from "next/link";
import { ArrowLeft, Clapperboard, Zap } from "lucide-react";
import { AppShell } from "@/src/components/app-shell";
import { AutomationBuilder } from "@/src/components/automation-builder";

type NewAutomationPageProps = {
  searchParams: Promise<{ type?: string }>;
};

function TypeChooser() {
  return (
    <div className="page-wrap builder-wrap">
      <Link className="back-link" href="/automations"><ArrowLeft size={16} /> Back to automations</Link>
      <header className="page-header">
        <div>
          <p className="eyebrow">New automation</p>
          <h1>Pick a starting point.</h1>
          <p className="muted page-lede">Both types run on the same rules-only engine — no AI, no surprises.</p>
        </div>
      </header>
      <div className="chooser-grid">
        <Link className="panel chooser-card" href="/automations/new?type=campaign">
          <span className="chooser-icon"><Clapperboard size={22} /></span>
          <div>
            <p className="eyebrow">Most popular</p>
            <h2>Follow-gated Reel campaign</h2>
            <p className="muted">Comment keyword → public reply → DM opt-in → follow check → deliver your link.</p>
          </div>
          <span className="chooser-cta">Build campaign</span>
        </Link>
        <Link className="panel chooser-card" href="/automations/new?type=classic">
          <span className="chooser-icon"><Zap size={22} /></span>
          <div>
            <p className="eyebrow">Classic</p>
            <h2>Keyword auto-responder</h2>
            <p className="muted">Comments or DMs with your keywords get an instant private reply — with up to three chained messages, referral and opt-in triggers, and schedules.</p>
          </div>
          <span className="chooser-cta">Build autoresponder</span>
        </Link>
      </div>
    </div>
  );
}

export default async function NewAutomationPage({ searchParams }: NewAutomationPageProps) {
  const { type } = await searchParams;
  if (type !== "campaign" && type !== "classic") {
    return <AppShell><TypeChooser /></AppShell>;
  }
  const classic = type === "classic";
  return (
    <AppShell>
      <div className="page-wrap builder-wrap">
        <Link className="back-link" href="/automations/new"><ArrowLeft size={16} /> Back to automation types</Link>
        <AutomationBuilder variant={classic ? "classic" : "campaign"} />
      </div>
    </AppShell>
  );
}

