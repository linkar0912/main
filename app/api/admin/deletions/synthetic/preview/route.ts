import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import {
  prepareSyntheticAccountCleanup,
  SYNTHETIC_CLEANUP_TARGET,
} from "@/src/lib/admin/deletion/synthetic-cleanup";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";

export async function POST(request: Request) {
  try {
    const context = await requireAdminWrite(request, {
      action: "synthetic_cleanup.preview",
      targetType: SYNTHETIC_CLEANUP_TARGET.type,
      targetId: SYNTHETIC_CLEANUP_TARGET.id,
    });
    // Issuing a cleanup challenge is audited; the token stays out of the audit row.
    const data = await runAuditedAdminMutation(context, () => prepareSyntheticAccountCleanup(context.owner), {
      summarize: (preview) => ({ count: preview.count, digest: preview.digest, challengeCreated: true, expiresAt: preview.challenge.expiresAt }),
    });
    return adminJson({ data });
  } catch (error) {
    return adminRouteError(error, "synthetic_cleanup_preview_failed");
  }
}
