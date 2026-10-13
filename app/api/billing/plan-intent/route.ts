import { NextResponse } from "next/server";

import { getValidatedSession } from "@/src/lib/auth/session";
import { clearPlanIntentCookie } from "@/src/lib/billing/plan-intent-cookie";
import { getServerEnv } from "@/src/lib/env";

export const runtime = "nodejs";

// DELETE /api/billing/plan-intent - forget the plan picked on /pricing once
// Billing has used it (checkout opened, or the normal view shown instead).
// Only the signed-in app calls it; the proxy refuses cross-site calls to it
// like every other mutation.
export async function DELETE(request: Request): Promise<NextResponse> {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return clearPlanIntentCookie(NextResponse.json({ data: { cleared: true } }, { headers: { "cache-control": "private, no-store" } }), getServerEnv());
}
