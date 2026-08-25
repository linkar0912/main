import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import { logger } from "@/src/lib/logger";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

// DELETE /api/links/[slug] - remove a tracked link from the current workspace.
// Accepts either the link id or the slug; the panel sends the id.
export async function DELETE(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { slug } = await context.params;
  if (!slug) return NextResponse.json({ error: "link id or slug required" }, { status: 400 });
  const repository = getRepository();
  // First try as id (preferred path for the UI), then as slug so external
  // callers (e.g. curl scripts) can address the link by either.
  const candidate = await repository.getTrackedLinkBySlugPublic(slug);
  if (!candidate) return NextResponse.json({ error: "link not found" }, { status: 404 });
  if (candidate.workspaceId !== session.workspaceId) {
    return NextResponse.json({ error: "link not found" }, { status: 404 });
  }
  try {
    const removed = await repository.deleteTrackedLink(session.workspaceId, candidate.id);
    if (!removed) return NextResponse.json({ error: "link not found" }, { status: 404 });
    return NextResponse.json({ data: { id: candidate.id, slug: candidate.slug } });
  } catch (error) {
    logger.error("Failed to delete tracked link", {
      id: candidate.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Could not delete the link" }, { status: 500 });
  }
}
