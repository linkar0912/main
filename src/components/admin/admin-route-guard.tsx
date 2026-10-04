import { redirect } from "next/navigation";

import { getPlatformOwnerIdentity, getPlatformOwnerSession, PlatformOwnerAuthError } from "@/src/lib/admin/authorization";

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
    // Only typed authorization failures redirect; outages reach the error boundary.
    if (!(error instanceof PlatformOwnerAuthError)) throw error;
    redirect(error.status === 428 ? "/admin/security" : "/dashboard");
  }
  return children;
}
