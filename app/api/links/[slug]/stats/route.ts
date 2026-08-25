import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

// GET /api/links/[slug]/stats - roll-up analytics for one tracked link.
export async function GET(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { slug } = await context.params;
  const repository = getRepository();
  const link = await repository.getTrackedLinkBySlug(session.workspaceId, slug);
  if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 });
  const stats = await repository.getTrackedLinkStats(session.workspaceId, link.id);
  return NextResponse.json({ data: stats });
}
