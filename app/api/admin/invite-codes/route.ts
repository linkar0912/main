import { z } from "zod";

import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminRead, requireAdminWrite } from "@/src/lib/admin/request-guard";
import { getPremiumInviteService } from "@/src/lib/billing/premium-invite";

const CreateInput = z.object({ label: z.string().trim().min(2).max(120), expiresAt: z.string().datetime().nullable().optional() }).strict();

export async function GET(request: Request) {
  try {
    await requireAdminRead(request);
    return adminJson({ data: await getPremiumInviteService().list() });
  } catch (error) {
    return adminRouteError(error, "invite_codes_unavailable");
  }
}

export async function POST(request: Request) {
  try {
    const input = CreateInput.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: "premium_invite.create", targetType: "premium_invite", targetId: input.label });
    const data = await runAuditedAdminMutation(
      guard,
      () => getPremiumInviteService().create({
        label: input.label,
        createdByUserId: guard.owner.userId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      }),
      { summarize: (record) => ({ id: record.id, label: record.label, planId: record.planId, durationDays: record.durationDays }) },
    );
    return adminJson({ data }, { status: 201 });
  } catch (error) {
    return adminRouteError(error, "invite_code_create_failed");
  }
}
