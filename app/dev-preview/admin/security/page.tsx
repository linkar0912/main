import { notFound } from "next/navigation";

import { AdminSecurityScreen } from "@/src/components/admin/admin-security-screen";
import { OWNER_EMAIL } from "../fixtures";

const MCP_KEYS = [
  { id: "mcpkey_preview_1", label: "Work laptop", scope: "WRITE" as const, tokenPrefix: "lkadm_7Hq2xP", createdAt: "2026-10-20T09:00:00.000Z", expiresAt: "2026-11-19T09:00:00.000Z", lastUsedAt: "2026-10-25T08:14:00.000Z", revokedAt: null, status: "ACTIVE" as const },
  { id: "mcpkey_preview_2", label: "Weekly metrics", scope: "READ" as const, tokenPrefix: "lkadm_Lm40aZ", createdAt: "2026-10-01T09:00:00.000Z", expiresAt: "2026-12-30T09:00:00.000Z", lastUsedAt: null, revokedAt: null, status: "ACTIVE" as const },
  { id: "mcpkey_preview_3", label: "Old desktop", scope: "WRITE" as const, tokenPrefix: "lkadm_q0Tr8B", createdAt: "2026-08-01T09:00:00.000Z", expiresAt: "2026-08-31T09:00:00.000Z", lastUsedAt: "2026-08-20T17:02:00.000Z", revokedAt: "2026-08-22T10:00:00.000Z", status: "REVOKED" as const },
];

export default function SecurityPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <AdminSecurityScreen
      ownerEmail={OWNER_EMAIL}
      initialSecurity={{ aal: "aal2", nextAal: "aal2", factors: [{ id: "f1", friendlyName: "Pixel 9", factorType: "totp", status: "verified" }, { id: "f2", friendlyName: "iPad backup", factorType: "totp", status: "verified" }] }}
      mcpKeys={MCP_KEYS}
      mcpUrl="https://admin.linkar.in/api/admin/mcp"
    />
  );
}
