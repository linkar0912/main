import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import { logger } from "@/src/lib/logger";
import { rejectCrossSiteRequest } from "@/src/lib/security/same-origin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

// DELETE /api/links/[slug] - remove a tracked link from the current workspace.
// Addressed by slug (the panel sends the slug). The lookup is scoped to the
// caller's workspace, so another tenant's link is indistinguishable from a
// missing one.
export async function DELETE(request: Request, context: RouteContext) {
  const crossSite = rejectCrossSiteRequest(request);
  if (crossSite) return crossSite;
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { slug } = await context.params;
  if (!slug) return NextResponse.json({ error: "link slug required" }, { status: 400 });
  const repository = getRepository();
  const candidate = await repository.getTrackedLinkBySlug(session.workspaceId, slug);
  if (!candidate) return NextResponse.json({ error: "link not found" }, { status: 404 });
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
