import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ContactsScreen } from "@/src/components/contacts-screen";
import { ScreenSkeleton } from "@/src/components/skeleton";

export const metadata = { title: "Contacts · Linkar (preview)" };

export default function ContactsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <ContactsScreen />
    </Suspense>
  );
}
