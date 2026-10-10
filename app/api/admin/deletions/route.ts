import { z } from "zod";
import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminRead, requireAdminWrite } from "@/src/lib/admin/request-guard";
import { listDeletionJobs } from "@/src/lib/admin/deletion/repository";
import { requestPermanentDeletion } from "@/src/lib/admin/deletion/service";
import { DeletionTargetSchema } from "@/src/lib/admin/deletion/target-schema";

const Input = z.object({
  target: DeletionTargetSchema,
  impactDigest: z.string().length(64), confirmation: z.string().min(1).max(300), challengeToken: z.string().min(20).max(200),
  includeAuthUsers: z.boolean().default(false),
}).strict();

export async function GET(request: Request) {
  try { await requireAdminRead(request); return adminJson({ data: await listDeletionJobs({ cursor: new URL(request.url).searchParams.get("cursor") }) }); }
  catch (error) { return adminRouteError(error, "deletion_list_failed"); }
}

export async function POST(request: Request) {
  try {
    const input = Input.parse(await request.json());
    const context = await requireAdminWrite(request, { action: "deletion.create", targetType: input.target.kind, targetId: input.target.id });
    const data = await runAuditedAdminMutation(context, () => requestPermanentDeletion({ ...input, context }), { allowReplay: true, summarize: (job) => ({ id: job.id, state: job.state, targetKind: job.targetKind, targetId: job.targetId }) });
    return adminJson({ data }, { status: 202 });
  } catch (error) { return adminRouteError(error, "deletion_request_failed"); }
}
