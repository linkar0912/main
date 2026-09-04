import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import { logger } from "@/src/lib/logger";
import { getServerEnv } from "@/src/lib/env";
import { unsealSecret } from "@/src/lib/security/secrets";
import { unsubscribeFacebookPageFromWebhooks } from "@/src/lib/facebook/oauth";

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
      avatarUrl: `/api/facebook/avatar?pageId=${encodeURIComponent(page.pageId)}&profileId=${encodeURIComponent(page.pageId)}`,
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
  let remoteUnsubscribed = true;
  try {
    const repository = getRepository();
    const pages = await repository.listFacebookPages(session.workspaceId);
    const page = pages?.find((candidate) => candidate.id === body.id);
    if (page) {
      try {
        const env = getServerEnv();
        if (!env.facebookTokenEncryptionKey) throw new Error("Facebook token encryption is not configured");
        const accessToken = unsealSecret(page.accessTokenEncrypted, env.facebookTokenEncryptionKey);
        remoteUnsubscribed = await unsubscribeFacebookPageFromWebhooks(page.pageId, accessToken, env.facebookApiVersion, undefined, env.facebookAppSecret);
      } catch (error) {
        remoteUnsubscribed = false;
        logger.warn("Remote Facebook webhook unsubscribe failed during disconnect", {
          workspaceId: session.workspaceId,
          pageId: page.pageId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const ok = await repository.deleteFacebookPage(session.workspaceId, body.id);
    if (!ok) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ disconnected: true, remoteUnsubscribed });
  } catch (error) {
    // If the remote unsubscribe above already succeeded, Meta has stopped
    // sending webhooks for this Page even though our own row still shows
    // CONNECTED - flag that divergence explicitly so it's diagnosable instead
    // of looking like an ordinary transient DB error. A retry self-heals this:
    // the row still exists, so the handler runs again and clears it.
    logger.error("Failed to disconnect Facebook Page", {
      workspaceId: session.workspaceId,
      pageId: body.id,
      remoteAlreadyUnsubscribed: remoteUnsubscribed,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Could not remove the connection. Try disconnecting again." }, { status: 500 });
  }
}
