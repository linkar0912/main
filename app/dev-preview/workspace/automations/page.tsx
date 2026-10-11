import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AutomationSectionsShell } from "@/src/components/automation-sections-shell";
import { AutomationsScreen } from "@/src/components/automations-screen";

export const metadata = { title: "Automations · Linkar (preview)" };

const BASE = "/dev-preview/workspace/automations";

/**
 * Dev-only: the real Automations list on fixtures. ?view=live|drafts|paused
 * opens a tab; ?state=busy shows the "Needs attention" group (expired
 * Instagram, a very long name), ?state=empty a new account, ?state=error a
 * failed load.
 */
export default function AutomationsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <AutomationSectionsShell section="my" basePath={BASE}>
      {/* useSearchParams (the view tab) needs a boundary on a static route. */}
      <Suspense>
        <AutomationsScreen basePath={BASE} />
      </Suspense>
    </AutomationSectionsShell>
  );
}
