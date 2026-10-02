import { PlatformOwnerAuthError } from "@/src/lib/admin/authorization";
import { redirect } from "next/navigation";

import { getPlatformOwnerIdentity, getPlatformOwnerSession } from "@/src/lib/admin/authorization";

export async function AdminRouteGuard({
  children,
  requireAal2 = true,
}: Readonly<{
  children: React.ReactNode;
  requireAal2?: boolean;
}>) {
  try {
    if (requireAal2) await getPlatformOwnerSession();
    else await getPlatformOwnerIdentity();
  } catch (error) {
    if (!(error instanceof PlatformOwnerAuthError)) throw error;
    if (typeof error === "object" && error !== null && "status" in error && error.status === 428) {
      redirect("/admin/security");
    }
    redirect("/dashboard");
  }
  return children;
}
