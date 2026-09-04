import { NextResponse } from "next/server";
import { z } from "zod";

import { requireBillingOwner } from "@/src/lib/billing/authorization";
import { billingErrorResponse } from "@/src/lib/billing/http";
import { getBillingService } from "@/src/lib/billing/service";

export const runtime = "nodejs";

const ChangePlanSchema = z.object({
  plan: z.enum(["creator", "growth", "agency"]),
  interval: z.enum(["MONTHLY", "ANNUAL"]),
}).strict();

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireBillingOwner(request);
  if (!guard.ok) return guard.error;
  const parsed = ChangePlanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 422 });
  try {
    return NextResponse.json(await getBillingService().schedulePlanChange(
      guard.session.workspaceId,
      parsed.data.plan,
      parsed.data.interval,
    ));
  } catch (error) {
    return billingErrorResponse(error);
  }
}
