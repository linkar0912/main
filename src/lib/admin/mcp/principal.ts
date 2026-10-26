import { AsyncLocalStorage } from "node:async_hooks";

import type { PlatformOwnerIdentity } from "@/src/lib/admin/authorization";

export type AdminMcpKeyScope = "READ" | "WRITE";

/** The owner an MCP key acts for, verified at the MCP endpoint for one request. */
export type AdminKeyPrincipal = {
  keyId: string;
  label: string;
  scope: AdminMcpKeyScope;
  expiresAt: string;
  owner: PlatformOwnerIdentity;
};

// Only the MCP endpoint sets this, after verifying the key, around the admin
// route handlers it calls in-process. A network request can never set it, so
// the admin HTTP API keeps accepting browser sessions only.
const storage = new AsyncLocalStorage<AdminKeyPrincipal>();

export function runWithAdminKeyPrincipal<T>(principal: AdminKeyPrincipal, operation: () => Promise<T>): Promise<T> {
  return storage.run(principal, operation);
}

export function currentAdminKeyPrincipal(): AdminKeyPrincipal | undefined {
  return storage.getStore();
}
