import { notFound } from "next/navigation";

import { AdminSecurityScreen } from "@/src/components/admin/admin-security-screen";
import { OWNER_EMAIL } from "../../fixtures";

export default function SecuritySetupPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AdminSecurityScreen ownerEmail={OWNER_EMAIL} initialSecurity={{ aal: "aal1", nextAal: "aal1", factors: [] }} />;
}
