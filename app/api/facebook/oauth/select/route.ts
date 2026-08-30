import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { listFacebookPages, subscribeFacebookPageToWebhooks } from "@/src/lib/facebook/oauth";
import { FACEBOOK_PAGE_SELECTION_COOKIE, readFacebookPageSelection } from "@/src/lib/facebook/page-selection";
import { sealSecret } from "@/src/lib/security/secrets";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { pageId?: unknown };
  if (typeof body.pageId !== "string" || !body.pageId) {
    return NextResponse.json({ error: "Facebook Page is required" }, { status: 400 });
  }
  const env = getServerEnv();
  if (!env.facebookTokenEncryptionKey) return NextResponse.json({ error: "Facebook is not configured" }, { status: 503 });
  const cookieStore = await cookies();
  const sealed = cookieStore.get(FACEBOOK_PAGE_SELECTION_COOKIE)?.value;
  const selection = sealed
    ? readFacebookPageSelection(sealed, env.facebookTokenEncryptionKey, session.workspaceId)
    : null;
  if (!selection) return NextResponse.json({ error: "Facebook Page selection expired" }, { status: 410 });
  const page = (await listFacebookPages(selection.userAccessToken, env.facebookApiVersion))
    .find((candidate) => candidate.id === body.pageId);
  if (!page) return NextResponse.json({ error: "Facebook Page is not available to this account" }, { status: 403 });
  const subscription = await subscribeFacebookPageToWebhooks(page.id, page.accessToken, env.facebookApiVersion);
  if (!subscription.subscribed) {
    return NextResponse.json({ error: subscription.error ?? "Facebook webhook subscription failed" }, { status: 502 });
  }
  await getRepository().upsertFacebookPage({
    workspaceId: session.workspaceId,
    pageId: page.id,
    pageName: page.name,
    facebookUserId: selection.facebookUserId,
    accessTokenEncrypted: sealSecret(page.accessToken, env.facebookTokenEncryptionKey),
    tokenExpiresAt: selection.tokenExpiresAt,
    status: "CONNECTED",
  });
  const response = NextResponse.json({ connected: true });
  response.cookies.delete(FACEBOOK_PAGE_SELECTION_COOKIE);
  return response;
}
