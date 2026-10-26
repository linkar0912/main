import { z } from "zod";

import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { listAdminMcpKeys, MCP_KEY_TTL_DAYS, mintAdminMcpKey } from "@/src/lib/admin/mcp/keys";
import { requireAdminSessionRead, requireAdminSessionWrite } from "@/src/lib/admin/request-guard";

const CreateKey = z.object({
  label: z.string().trim().min(2).max(80),
  scope: z.enum(["READ", "WRITE"]),
  ttlDays: z.literal(MCP_KEY_TTL_DAYS),
}).strict();

// MCP keys are minted and listed only from a browser session at AAL2; a key
// can never mint another key or extend itself.
export async function GET(request: Request) {
  try {
    const owner = await requireAdminSessionRead(request);
    return adminJson({ data: await listAdminMcpKeys(owner.userId) });
  } catch (error) { return adminRouteError(error, "mcp_keys_unavailable"); }
}

export async function POST(request: Request) {
  try {
    const input = CreateKey.parse(await request.json());
    const guard = await requireAdminSessionWrite(request, { action: "mcp_key.create", targetType: "mcp_key", targetId: input.label });
    // The key is returned to the owner once; the audit row keeps only its summary.
    const data = await runAuditedAdminMutation(guard, () => mintAdminMcpKey({ owner: guard.owner, ...input }), {
      summarize: ({ key }) => ({ id: key.id, label: key.label, scope: key.scope, expiresAt: key.expiresAt }),
    });
    return adminJson({ data }, { status: 201 });
  } catch (error) { return adminRouteError(error, "mcp_key_create_failed"); }
}
