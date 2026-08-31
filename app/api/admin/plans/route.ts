import { z } from "zod";

import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { createAdminPlan, listAdminPlans, PlanValuesSchema } from "@/src/lib/admin/plan-service";
import { requireAdminRead, requireAdminWrite } from "@/src/lib/admin/request-guard";

const CreatePlan = PlanValuesSchema.extend({ key: z.string().min(2).max(40) });

export async function GET(request: Request) {
  try { await requireAdminRead(request); return adminJson({ data: await listAdminPlans() }); }
  catch (error) { return adminRouteError(error, "plans_unavailable"); }
}

export async function POST(request: Request) {
  try {
    const input = CreatePlan.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: "plan.create", targetType: "plan", targetId: input.key });
    return adminJson({ data: await runAuditedAdminMutation(guard, () => createAdminPlan(input)) }, { status: 201 });
  } catch (error) { return adminRouteError(error, "plan_create_failed"); }
}
