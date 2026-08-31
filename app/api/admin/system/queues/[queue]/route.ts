import { z } from "zod";
import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";
import { executeQueueCommand } from "@/src/lib/admin/system/commands";
const Command = z.object({ action: z.enum(["pause", "resume", "retry_failed_jobs"]), jobIds: z.array(z.string().min(1).max(200)).max(100).optional() }).strict();
export async function PATCH(request: Request, context: RouteContext<"/api/admin/system/queues/[queue]">) { try { const { queue } = await context.params; const input = Command.parse(await request.json()); const guard = await requireAdminWrite(request, { action: `system.queue.${input.action}`, targetType: "queue", targetId: queue }); return adminJson({ data: await runAuditedAdminMutation(guard, () => executeQueueCommand(queue, input)) }); } catch (error) { return adminRouteError(error, "queue_command_failed"); } }
