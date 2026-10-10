import { notFound } from "next/navigation";
import { InsightsScreen } from "@/src/components/insights-screen";

export const metadata = { title: "Insights · Linkar (preview)" };

export default function InsightsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <InsightsScreen />;
}
