import { NextResponse } from "next/server";

import { requireBillingOwner } from "@/src/lib/billing/authorization";
import { billingErrorResponse } from "@/src/lib/billing/http";
import { getBillingService } from "@/src/lib/billing/service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireBillingOwner(request);
  if (!guard.ok) return guard.error;
  try {
    return NextResponse.json(await getBillingService().cancelAtCycleEnd(guard.session.workspaceId, guard.auditContext));
  } catch (error) {
    return billingErrorResponse(error);
  }
}
