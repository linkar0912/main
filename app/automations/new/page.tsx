import Link from "next/link";
import { ArrowLeft, Clapperboard, Zap } from "lucide-react";
import { AppShell } from "@/src/components/app-shell";
import { AutomationBuilder } from "@/src/components/automation-builder";
import { getTemplateById } from "@/src/lib/automation/templates";

type NewAutomationPageProps = {
  searchParams: Promise<{ type?: string; template?: string }>;
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
      <p className="chooser-alt muted">Want a head start? <Link className="text-link" href="/automations/templates">Browse premade templates</Link></p>
    </div>
  );
}

export default async function NewAutomationPage({ searchParams }: NewAutomationPageProps) {
  const { type, template: templateId } = await searchParams;
  if (type !== "campaign" && type !== "classic") {
    return <AppShell><TypeChooser /></AppShell>;
  }
  const classic = type === "classic";
  const template = templateId ? getTemplateById(templateId) : undefined;
  const setup = template?.available ? template.setup : undefined;
  return (
    <AppShell>
      <div className="page-wrap builder-wrap">
        <Link className="back-link" href={setup ? "/automations/templates" : "/automations/new"}>
          <ArrowLeft size={16} /> {setup ? "Back to templates" : "Back to automation types"}
        </Link>
        {template?.available && setup && (
          <p className="template-prefill-note muted">
            Started from the “{template.title.split(":")[0]}” recipe — tweak anything before saving.
          </p>
        )}
        <AutomationBuilder
          variant={classic ? "classic" : "campaign"}
          initialName={setup?.name}
          initialDefinition={setup?.definition}
        />
      </div>
    </AppShell>
  );
}

