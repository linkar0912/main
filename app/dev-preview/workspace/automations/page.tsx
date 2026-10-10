import { notFound } from "next/navigation";
import { AutomationSectionsShell } from "@/src/components/automation-sections-shell";
import { AutomationsScreen } from "@/src/components/automations-screen";

export const metadata = { title: "Automations · Linkar (preview)" };

export default function AutomationsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <AutomationSectionsShell section="my">
      <AutomationsScreen />
    </AutomationSectionsShell>
  );
}
