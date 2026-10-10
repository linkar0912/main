import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SettingsScreen } from "@/src/components/settings-screen";
import { ScreenSkeleton } from "@/src/components/skeleton";

export const metadata = { title: "Settings · Linkar (preview)" };

// Same Suspense boundary as the real page: SettingsScreen reads ?section=
// (connections | delivery | billing | team | policies) with useSearchParams.
export default function SettingsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <SettingsScreen />
    </Suspense>
  );
}
