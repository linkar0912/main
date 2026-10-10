import { notFound } from "next/navigation";
import { AutomationSectionsShell } from "@/src/components/automation-sections-shell";
import { SequencesScreen } from "@/src/components/sequences-screen";

export const metadata = { title: "Sequences · Linkar (preview)" };

export default function SequencesPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <AutomationSectionsShell section="sequences">
      <SequencesScreen />
    </AutomationSectionsShell>
  );
}
