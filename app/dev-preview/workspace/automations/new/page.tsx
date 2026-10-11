import { notFound } from "next/navigation";
import NewAutomationPage from "@/app/(app)/automations/new/page";

export const metadata = { title: "New automation · Linkar (preview)" };

/** Dev-only: the real new-automation page (?type=campaign | classic, ?template=…) on fixtures. */
export default function NewAutomationPreviewPage(props: Parameters<typeof NewAutomationPage>[0]) {
  if (process.env.NODE_ENV !== "development") notFound();
  return <NewAutomationPage {...props} />;
}
