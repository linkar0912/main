import { notFound } from "next/navigation";
import { QuickAutomationScreen } from "@/src/components/quick-automation-screen";

export const metadata = { title: "Quick Automation · Linkar (preview)" };

export default function QuickAutomationPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <QuickAutomationScreen />;
}
