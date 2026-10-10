import { notFound } from "next/navigation";
import { ContactsScreen } from "@/src/components/contacts-screen";

export const metadata = { title: "Contacts · Linkar (preview)" };

export default function ContactsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ContactsScreen />;
}
