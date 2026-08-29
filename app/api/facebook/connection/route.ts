import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import { logger } from "@/src/lib/logger";

export const runtime = "nodejs";

/** GET: list the workspace's connected Facebook Pages (for the settings page). */
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pages = await getRepository().listFacebookPages(session.workspaceId);
  return NextResponse.json({
    data: pages.map((page) => ({
      id: page.id,
      pageId: page.pageId,
      pageName: page.pageName,
      status: page.status,
      connectedAt: page.connectedAt,
    })),
  });
}

/** DELETE: disconnect a Facebook Page from the workspace. */
export async function DELETE(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "Page ID is required" }, { status: 400 });
  }
  try {
    const ok = await getRepository().deleteFacebookPage(session.workspaceId, body.id);
    if (!ok) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    logger.error("Failed to disconnect Facebook Page", {
      workspaceId: session.workspaceId,
      pageId: body.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
