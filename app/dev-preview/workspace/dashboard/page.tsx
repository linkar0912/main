import { notFound } from "next/navigation";
import { DashboardScreen } from "@/src/components/dashboard-screen";

export const metadata = { title: "Home · Linkar (preview)" };

// No initial props: everything loads through the preview fetch shim.
export default function DashboardPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DashboardScreen />;
}
