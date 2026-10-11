import { notFound } from "next/navigation";
import { AutomationDetailFrame } from "@/src/components/automation-detail-frame";
import { loadAutomation } from "./load-automation";

// Reads the session to name the automation in the header (see (sections)/page.tsx).
export const dynamic = "force-dynamic";

/**
 * One header for an automation's Overview, Activity and Edit tabs. As a
 * layout it stays mounted while the tabs switch; only the content below swaps.
 */
export default async function AutomationDetailLayout({ children, params }: Readonly<{
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  const { session, automation } = await loadAutomation(id);
  if (session && automation === null) notFound();
  return (
    <AutomationDetailFrame automationId={id} initialAutomation={automation ?? undefined}>
      {children}
    </AutomationDetailFrame>
  );
}
