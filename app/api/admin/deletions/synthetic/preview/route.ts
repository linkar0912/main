import { adminJson, adminRouteError } from "@/src/lib/admin/http";
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
    return adminJson({ data: await prepareSyntheticAccountCleanup(context.owner) });
  } catch (error) {
    return adminRouteError(error, "synthetic_cleanup_preview_failed");
  }
}
