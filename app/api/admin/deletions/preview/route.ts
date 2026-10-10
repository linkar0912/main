import { z } from "zod";
import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";
import { prepareDeletion } from "@/src/lib/admin/deletion/service";
import { DeletionTargetSchema } from "@/src/lib/admin/deletion/target-schema";

const Input = z.object({ target: DeletionTargetSchema }).strict();

export async function POST(request: Request) {
  try {
    const input = Input.parse(await request.json());
    const context = await requireAdminWrite(request, { action: "deletion.preview", targetType: input.target.kind, targetId: input.target.id });
    // Issuing a deletion challenge is itself a privileged step; the token stays out of the audit row.
    const data = await runAuditedAdminMutation(context, () => prepareDeletion(input.target, context.owner), {
      summarize: (prepared) => ({ targetKind: input.target.kind, targetId: input.target.id, impactDigest: prepared.impactDigest, counts: prepared.impact.counts, challengeCreated: true, expiresAt: prepared.challenge.expiresAt }),
    });
    return adminJson({ data });
  } catch (error) { return adminRouteError(error, "deletion_preview_failed"); }
}
