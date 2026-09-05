import { z } from "zod";

import {
  requestSyntheticAccountCleanup,
  SYNTHETIC_CLEANUP_TARGET,
} from "@/src/lib/admin/deletion/synthetic-cleanup";
import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";

const Input = z.object({
  impactDigest: z.string().length(64),
  confirmation: z.string().min(1).max(300),
  challengeToken: z.string().min(20).max(200),
}).strict();

export async function POST(request: Request) {
  try {
    const input = Input.parse(await request.json());
    const context = await requireAdminWrite(request, {
      action: "synthetic_cleanup.create",
      targetType: SYNTHETIC_CLEANUP_TARGET.type,
      targetId: SYNTHETIC_CLEANUP_TARGET.id,
    });
    const data = await runAuditedAdminMutation(
      context,
      () => requestSyntheticAccountCleanup({ ...input, context }),
      {
        before: { impactDigest: input.impactDigest },
        summarize: (job) => ({ id: job.id, state: job.state, targetKind: job.targetKind }),
      },
    );
    return adminJson({ data }, { status: 202 });
  } catch (error) {
    return adminRouteError(error, "synthetic_cleanup_request_failed");
  }
}
