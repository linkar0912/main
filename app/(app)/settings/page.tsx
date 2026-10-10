import { Suspense } from "react";
import { SettingsScreen } from "@/src/components/settings-screen";
import { ScreenSkeleton } from "@/src/components/skeleton";

export const metadata = { title: "Settings · Linkar" };

// SettingsScreen reads ?section= and the OAuth result with useSearchParams,
// which needs a Suspense boundary so the rest of the page can prerender.
export default function SettingsPage() {
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <SettingsScreen />
    </Suspense>
  );
}
