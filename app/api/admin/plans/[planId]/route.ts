import { z } from "zod";

import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { PlanValuesSchema, retireAdminPlan, updateAdminPlan } from "@/src/lib/admin/plan-service";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";

const UpdatePlan = PlanValuesSchema.extend({ version: z.number().int().positive() });
const RetirePlan = z.object({ version: z.number().int().positive() }).strict();

export async function PATCH(request: Request, context: RouteContext<"/api/admin/plans/[planId]">) {
  try {
    const { planId } = await context.params; const input = UpdatePlan.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: "plan.update", targetType: "plan", targetId: planId });
    return adminJson({ data: await runAuditedAdminMutation(guard, () => updateAdminPlan(planId, input)) });
  } catch (error) { return adminRouteError(error, "plan_update_failed"); }
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/plans/[planId]">) {
  try {
    const { planId } = await context.params; const input = RetirePlan.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: "plan.retire", targetType: "plan", targetId: planId });
    return adminJson({ data: await runAuditedAdminMutation(guard, () => retireAdminPlan(planId, input.version)) });
  } catch (error) { return adminRouteError(error, "plan_retire_failed"); }
}
