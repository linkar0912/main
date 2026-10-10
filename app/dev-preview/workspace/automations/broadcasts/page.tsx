import { notFound } from "next/navigation";
import { AutomationSectionsShell } from "@/src/components/automation-sections-shell";
import { BroadcastsScreen } from "@/src/components/broadcasts-screen";

export const metadata = { title: "Broadcasts · Linkar (preview)" };

export default function BroadcastsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <AutomationSectionsShell section="broadcasts">
      <BroadcastsScreen />
    </AutomationSectionsShell>
  );
}
