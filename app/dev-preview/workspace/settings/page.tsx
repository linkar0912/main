import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SettingsScreen } from "@/src/components/settings-screen";
import { ScreenSkeleton } from "@/src/components/skeleton";
import { SettingsPreviewVariants } from "./settings-preview-variants";

export const metadata = { title: "Settings · Linkar (preview)" };

// Same Suspense boundary as the real page: SettingsScreen reads ?section=
// (connections | delivery | team | billing | policies | security) with
// useSearchParams. Review states: ?state=empty | error | slow from the shared
// fixtures, and ?variant=attention | long for Settings-only cases.
export default function SettingsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <SettingsPreviewVariants>
      <Suspense fallback={<ScreenSkeleton />}>
        <SettingsScreen />
      </Suspense>
    </SettingsPreviewVariants>
  );
}
