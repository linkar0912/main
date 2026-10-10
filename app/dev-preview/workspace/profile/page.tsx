import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ProfileScreen } from "@/src/components/profile-screen";
import { ScreenSkeleton } from "@/src/components/skeleton";

export const metadata = { title: "My Profile · Linkar (preview)" };

export default function ProfilePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <ProfileScreen />
    </Suspense>
  );
}
