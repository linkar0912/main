import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/src/components/app-shell";
import { AutomationBuilder } from "@/src/components/automation-builder";
import { getTemplateById } from "@/src/lib/automation/templates";

type NewAutomationPageProps = {
  searchParams: Promise<{ type?: string; template?: string }>;
};

// The template picker modal (opened from every "New automation" button) is the
// only place that chooses a type or template now — landing here bare defaults
// straight to a blank classic builder instead of a second chooser page.
export default async function NewAutomationPage({ searchParams }: NewAutomationPageProps) {
  const { type, template: templateId } = await searchParams;
  const classic = type !== "campaign";
  const template = templateId ? getTemplateById(templateId) : undefined;
  const setup = template?.setup;
  return (
    <AppShell>
      <div className="page-wrap builder-wrap">
        <Link className="back-link" href="/automations">
          <ArrowLeft size={16} /> Back to automations
        </Link>
        {template && setup && (
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
