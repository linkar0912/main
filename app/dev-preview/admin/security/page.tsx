import { notFound } from "next/navigation";

import { AdminSecurityScreen } from "@/src/components/admin/admin-security-screen";
import { OWNER_EMAIL } from "../fixtures";

export default function SecurityPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AdminSecurityScreen ownerEmail={OWNER_EMAIL} initialSecurity={{ aal: "aal2", nextAal: "aal2", factors: [{ id: "f1", friendlyName: "Pixel 9", factorType: "totp", status: "verified" }, { id: "f2", friendlyName: "iPad backup", factorType: "totp", status: "verified" }] }} />;
}
