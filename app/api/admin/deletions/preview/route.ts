import { z } from "zod";
import { adminJson, adminRouteError } from "@/src/lib/admin/http";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";
import { prepareDeletion } from "@/src/lib/admin/deletion/service";

const Input = z.object({ target: z.object({ kind: z.enum(["USER", "WORKSPACE"]), id: z.string().min(1).max(200) }).strict() }).strict();

export async function POST(request: Request) {
  try {
    const input = Input.parse(await request.json());
    const context = await requireAdminWrite(request, { action: "deletion.preview", targetType: input.target.kind, targetId: input.target.id });
    return adminJson({ data: await prepareDeletion(input.target, context.owner) });
  } catch (error) { return adminRouteError(error, "deletion_preview_failed"); }
}
