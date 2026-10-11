import { AutomationEditorScreen } from "@/src/components/automation-editor-screen";

export const metadata = { title: "Edit automation · Linkar" };

// The Edit tab: the builder under the shared [id] header and tabs.
export default async function EditAutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AutomationEditorScreen automationId={id} embedded />;
}
