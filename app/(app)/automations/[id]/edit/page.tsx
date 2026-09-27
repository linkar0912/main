import { AutomationEditorScreen } from "@/src/components/automation-editor-screen";

export const metadata = { title: "Edit automation · Linkar" };

export default async function EditAutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AutomationEditorScreen automationId={id} />;
}
