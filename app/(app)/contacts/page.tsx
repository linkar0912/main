import { Suspense } from "react";
import { ContactsScreen } from "@/src/components/contacts-screen";
import { ScreenSkeleton } from "@/src/components/skeleton";

export const metadata = { title: "Contacts · Linkar" };

// ContactsScreen follows ?q= (search) and ?contact= (open a drawer, from the
// ⌘K palette) with useSearchParams, which needs a Suspense boundary so the
// rest of the page can prerender.
export default function ContactsPage() {
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <ContactsScreen />
    </Suspense>
  );
}
