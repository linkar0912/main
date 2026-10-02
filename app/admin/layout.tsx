import { PlatformOwnerAuthError } from "@/src/lib/admin/authorization";
import { redirect } from "next/navigation";

import { AdminShell } from "@/src/components/admin/admin-shell";
import { getPlatformOwnerIdentity } from "@/src/lib/admin/authorization";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let owner;
  try {
    owner = await getPlatformOwnerIdentity();
  } catch (error) {
    if (!(error instanceof PlatformOwnerAuthError)) throw error;
    redirect("/dashboard");
  }
  return <AdminShell owner={{ email: owner.email }}>{children}</AdminShell>;
}
