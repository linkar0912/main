import { notFound } from "next/navigation";
import { AutomationEditorScreen } from "@/src/components/automation-editor-screen";

export const metadata = { title: "Edit automation · Linkar (preview)" };

/** Dev-only: the real editor for a fixture automation (auto_price_list, auto_fb_details, auto_diwali_sale, …). */
export default async function EditAutomationPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { id } = await params;
  return <AutomationEditorScreen automationId={id} />;
}
