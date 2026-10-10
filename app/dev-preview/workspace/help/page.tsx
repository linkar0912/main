import { notFound } from "next/navigation";
import { HelpScreen } from "@/src/components/help-screen";

export const metadata = { title: "Help · Linkar (preview)" };

export default function HelpPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <HelpScreen />;
}
