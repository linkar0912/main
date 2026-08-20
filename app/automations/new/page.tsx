import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/src/components/app-shell";
import { AutomationBuilder } from "@/src/components/automation-builder";

export default function NewAutomationPage() {
  return (
    <AppShell>
      <div className="page-wrap builder-wrap">
        <Link className="back-link" href="/automations"><ArrowLeft size={16} /> Back to automations</Link>
        <AutomationBuilder />
      </div>
    </AppShell>
  );
}
