import { z } from "zod";
import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminRead, requireAdminWrite } from "@/src/lib/admin/request-guard";
import { executeSystemCommand } from "@/src/lib/admin/system/commands";
import { getAdminSystemService } from "@/src/lib/admin/system/service";
const Command = z.object({ action: z.enum(["run_delivery_reconciliation", "run_usage_reconciliation"]) }).strict();
export async function GET(request: Request) { try { await requireAdminRead(request); return adminJson({ data: await getAdminSystemService().snapshot() }); } catch (error) { return adminRouteError(error, "system_unavailable"); } }
export async function POST(request: Request) { try { const input = Command.parse(await request.json()); const guard = await requireAdminWrite(request, { action: `system.${input.action}`, targetType: "system", targetId: input.action }); return adminJson({ data: await runAuditedAdminMutation(guard, () => executeSystemCommand(input.action)) }, { status: 202 }); } catch (error) { return adminRouteError(error, "system_command_failed"); } }
