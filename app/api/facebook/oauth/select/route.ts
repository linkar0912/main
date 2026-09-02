import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { listFacebookPages, subscribeFacebookPageToWebhooks, FacebookOAuthError } from "@/src/lib/facebook/oauth";
import { FACEBOOK_PAGE_SELECTION_COOKIE, readFacebookPageSelection } from "@/src/lib/facebook/page-selection";
import { sealSecret } from "@/src/lib/security/secrets";
import { getRepository } from "@/src/lib/repository-provider";
import { FacebookPageOwnershipError } from "@/src/lib/repository";
import { getEntitlementService } from "@/src/lib/entitlements/service";
import { entitlementErrorResponse } from "@/src/lib/entitlements/http";
import { logger } from "@/src/lib/logger";

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
  const repository = getRepository();
  let page;
  let subscription;
  try {
    page = (await listFacebookPages(selection.userAccessToken, env.facebookApiVersion, undefined, env.facebookAppSecret))
      .find((candidate) => candidate.id === body.pageId);
    if (!page) return NextResponse.json({ error: "Facebook Page is not available to this account" }, { status: 403 });
    subscription = await subscribeFacebookPageToWebhooks(page.id, page.accessToken, env.facebookApiVersion, undefined, env.facebookAppSecret);
  } catch (error) {
    // listFacebookPages and subscribeFacebookPageToWebhooks both throw
    // (jsonOrThrow) on any non-2xx Graph response - a rate limit right after
    // token exchange is plausible here. Previously this fell through as an
    // unhandled exception (generic 500) instead of a message the settings
    // page could show the user.
    logger.warn("Could not connect the selected Facebook Page", {
      workspaceId: session.workspaceId,
      pageId: body.pageId,
      error: error instanceof Error ? error.message : String(error),
    });
    const retryable = error instanceof FacebookOAuthError && error.retryable;
    return NextResponse.json(
      { error: retryable ? "Meta is temporarily unavailable. Try again in a moment." : "Could not connect that Facebook Page. Reconnect and try again." },
      { status: 502 },
    );
  }
  if (!subscription.subscribed) {
    return NextResponse.json({ error: subscription.error ?? "Facebook webhook subscription failed" }, { status: 502 });
  }
  // Deliberately checked here, immediately before the write, rather than
  // before the Graph API calls above - that used to leave a window where two
  // concurrent selections could both read the same pre-connection count and
  // both pass. This is a narrowing mitigation, not a full fix: the
  // read-then-write gap here is still not atomic without a DB-level lock or
  // reservation row, but it shrinks the race window from "the whole page
  // listing + webhook subscribe round-trip" to one in-process count query.
  try {
    await getEntitlementService().assertEntitled(
      session.workspaceId,
      "facebook",
      (await repository.listFacebookPages(session.workspaceId)).length,
    );
  } catch (error) {
    return entitlementErrorResponse(error)
      ?? NextResponse.json({ error: "entitlement_check_failed" }, { status: 500 });
  }
  try {
    await repository.upsertFacebookPage({
      workspaceId: session.workspaceId,
      pageId: page.id,
      pageName: page.name,
      facebookUserId: selection.facebookUserId,
      accessTokenEncrypted: sealSecret(page.accessToken, env.facebookTokenEncryptionKey),
      tokenExpiresAt: selection.tokenExpiresAt,
      status: "CONNECTED",
    });
  } catch (error) {
    if (!(error instanceof FacebookPageOwnershipError)) throw error;
    const response = NextResponse.json({ error: error.message, code: "already-connected" }, { status: 409 });
    response.cookies.delete(FACEBOOK_PAGE_SELECTION_COOKIE);
    return response;
  }
  const response = NextResponse.json({ connected: true });
  response.cookies.delete(FACEBOOK_PAGE_SELECTION_COOKIE);
  return response;
}
