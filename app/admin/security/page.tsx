import { redirect } from "next/navigation";

import { AdminSecurityScreen } from "@/src/components/admin/admin-security-screen";
import { getPlatformOwnerIdentity } from "@/src/lib/admin/authorization";
import { loadAdminSecurityState } from "@/src/lib/admin/security";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  let owner;
  try {
    owner = await getPlatformOwnerIdentity();
  } catch {
    redirect("/dashboard");
  }

  const security = await loadAdminSecurityState(owner.aal);
  return <AdminSecurityScreen ownerEmail={owner.email} initialSecurity={security} />;
}
