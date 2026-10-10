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
  const body: unknown = await request.json().catch(() => undefined);
  if (body === undefined) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const parsed = Input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invite_code_invalid" }, { status: 422 });
  try {
    const data = await getPremiumInviteService().redeem({
      code: parsed.data.code,
      workspaceId: guard.session.workspaceId,
      userId: guard.session.userId,
    });
    // Entitlements are cached per process for up to 30 seconds
    // (createEntitlementService's cacheTtlMs), so this clears only this
    // instance; other web instances and the worker pick the invite plan up
    // when their entry expires. `refresh` tells the client to drop its own
    // cached workspace data now.
    getEntitlementService().invalidateWorkspace(guard.session.workspaceId);
    return NextResponse.json({
      data: {
        plan: data.plan,
        expiresAt: data.expiresAt,
      },
      refresh: true,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "invite_code_redemption_failed";
    if (conflicts.has(code)) return NextResponse.json({ error: code }, { status: 409 });
    if (invalid.has(code)) return NextResponse.json({ error: code }, { status: 422 });
    return NextResponse.json({ error: "invite_code_redemption_failed" }, { status: 500 });
  }
}
