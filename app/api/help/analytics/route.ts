import { z } from "zod";
import { getValidatedSession } from "@/src/lib/auth/session";
import { normalizeHelpQuery } from "@/src/lib/help-search";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

const payloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("search"),
    query: z.string().trim().min(1).max(120),
    resultCount: z.number().int().min(0).max(10_000),
  }),
  z.object({
    kind: z.literal("feedback"),
    articleKey: z.string().trim().min(1).max(160),
    helpful: z.boolean(),
  }),
]);

export async function POST(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid help analytics payload" }, { status: 400 });

  const repository = getRepository();
  const createdAt = new Date().toISOString();
  if (parsed.data.kind === "search") {
    await repository.recordHelpSearch(session.workspaceId, {
      query: normalizeHelpQuery(parsed.data.query),
      resultCount: parsed.data.resultCount,
      createdAt,
    });
  } else {
    await repository.recordHelpFeedback(session.workspaceId, {
      articleKey: parsed.data.articleKey,
      helpful: parsed.data.helpful,
      createdAt,
    });
  }

  return Response.json({ data: { recorded: true } }, { status: 201 });
}
