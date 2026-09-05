import { NextResponse } from "next/server";
import { z } from "zod";

import { requireBillingOwner } from "@/src/lib/billing/authorization";
import { getPremiumInviteService } from "@/src/lib/billing/premium-invite";
import { getEntitlementService } from "@/src/lib/entitlements/service";

const Input = z.object({ code: z.string().trim().min(6).max(80) }).strict();
const conflicts = new Set(["invite_code_used", "premium_access_already_active"]);
const invalid = new Set(["invite_code_invalid", "invite_code_expired", "invite_code_revoked"]);

export async function POST(request: Request) {
  const guard = await requireBillingOwner(request);
  if (!guard.ok) return guard.error;
  try {
    const input = Input.parse(await request.json());
    const data = await getPremiumInviteService().redeem({
      code: input.code,
      workspaceId: guard.session.workspaceId,
      userId: guard.session.userId,
    });
    getEntitlementService().invalidateWorkspace(guard.session.workspaceId);
    return NextResponse.json({ data });
  } catch (error) {
    const code = error instanceof Error ? error.message : "invite_code_redemption_failed";
    if (conflicts.has(code)) return NextResponse.json({ error: code }, { status: 409 });
    if (invalid.has(code) || error instanceof z.ZodError) return NextResponse.json({ error: error instanceof z.ZodError ? "invite_code_invalid" : code }, { status: 422 });
    return NextResponse.json({ error: "invite_code_redemption_failed" }, { status: 500 });
  }
}
