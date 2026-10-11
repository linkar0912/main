import { notFound } from "next/navigation";
import { AutomationDetailFrame } from "@/src/components/automation-detail-frame";
import { automations } from "../../_preview/fixtures";

/**
 * Dev-only mirror of app/(app)/automations/[id]/layout: the same header and
 * tabs, with the automation looked up in the fixtures instead of the
 * repository. Try auto_diwali_sale (campaign), auto_fb_details (Facebook),
 * auto_price_list (has a failed message) or auto_bridal_consult (draft).
 */
export default async function AutomationDetailPreviewLayout({ children, params }: Readonly<{
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}>) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { id } = await params;
  const automation = automations().find((candidate) => candidate.id === id);
  if (!automation) notFound();
  return (
    <AutomationDetailFrame automationId={id} initialAutomation={automation} basePath="/dev-preview/workspace/automations">
      {children}
    </AutomationDetailFrame>
  );
}
