import { redirect } from "next/navigation";

import { AdminSecurityScreen } from "@/src/components/admin/admin-security-screen";
import { getPlatformOwnerIdentity, PlatformOwnerAuthError } from "@/src/lib/admin/authorization";
import { listAdminMcpKeys } from "@/src/lib/admin/mcp/keys";
import { loadAdminSecurityState } from "@/src/lib/admin/security";
import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  let owner;
  try {
    owner = await getPlatformOwnerIdentity();
  } catch (error) {
    if (!(error instanceof PlatformOwnerAuthError)) throw error;
    redirect("/dashboard");
  }

  const security = await loadAdminSecurityState(owner.aal);
  // MCP keys are minted only from a TOTP-verified session. A failure to list
  // them (the table not migrated yet, a database hiccup) must not take the
  // two-factor settings on this page down with it.
  const mcpKeys = owner.aal === "aal2"
    ? await listAdminMcpKeys(owner.userId).catch((error: unknown) => {
        logger.error("Could not list MCP keys", { error: error instanceof Error ? error.message : String(error) });
        return null;
      })
    : undefined;
  return (
    <AdminSecurityScreen
      ownerEmail={owner.email}
      initialSecurity={security}
      mcpKeys={mcpKeys}
      mcpUrl={new URL("/api/admin/mcp", getServerEnv().adminUrl).toString()}
    />
  );
}
