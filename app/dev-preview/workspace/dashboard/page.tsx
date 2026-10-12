import { notFound } from "next/navigation";
import { DashboardScreen } from "@/src/components/dashboard-screen";
import { parseRange } from "@/src/lib/analytics-range";

export const metadata = { title: "Home · Linkar (preview)" };

// No data props: everything loads through the preview fetch shim. The
// fixtures answer 7, 14 and 30 days (?range=7|14|30).
export default async function DashboardPreviewPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { range } = await searchParams;
  return <DashboardScreen initialRange={parseRange(range)} />;
}
