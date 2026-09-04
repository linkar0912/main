import { NextResponse } from "next/server";

import { requireBillingReader } from "@/src/lib/billing/authorization";
import { privateJsonHeaders } from "@/src/lib/billing/http";
import { getBillingService } from "@/src/lib/billing/service";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await requireBillingReader(request);
  if (!guard.ok) return guard.error;
  const data = await getBillingService().getBillingView(guard.session.workspaceId, guard.role);
  return NextResponse.json({ data }, { headers: privateJsonHeaders });
}
