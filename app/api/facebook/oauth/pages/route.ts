import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireManager } from "@/src/lib/auth/require-role";
import { getServerEnv } from "@/src/lib/env";
import { listFacebookPages, FacebookOAuthError } from "@/src/lib/facebook/oauth";
import { FACEBOOK_PAGE_SELECTION_COOKIE, readFacebookPageSelection } from "@/src/lib/facebook/page-selection";
import { logger } from "@/src/lib/logger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // Listing the Pages uses the person's Facebook token, so it is held to the
  // same rule as connecting one: owners and admins, and only the person who
  // granted it (readFacebookPageSelection).
  const guard = await requireManager(request);
  if (!guard.ok) return guard.error;
  const { session } = guard;
  const env = getServerEnv();
  if (!env.facebookTokenEncryptionKey) return NextResponse.json({ error: "Facebook is not configured" }, { status: 503 });
  const sealed = (await cookies()).get(FACEBOOK_PAGE_SELECTION_COOKIE)?.value;
  const selection = sealed
    ? readFacebookPageSelection(sealed, env.facebookTokenEncryptionKey, session.workspaceId, session.userId)
    : null;
  if (!selection) return NextResponse.json({ error: "Facebook Page selection expired" }, { status: 410 });
  try {
    const pages = await listFacebookPages(selection.userAccessToken, env.facebookApiVersion, undefined, env.facebookAppSecret);
    return NextResponse.json({
      data: pages.map(({ id, name, category }) => ({ id, name, ...(category ? { category } : {}) })),
    });
  } catch (error) {
    // listFacebookPages throws (jsonOrThrow) on any non-2xx Graph response -
    // a rate limit or an expired user token right after sign-in is plausible
    // here. Previously this fell through as an unhandled exception (generic
    // 500) instead of a message the settings page could show the user.
    logger.warn("Could not list Facebook Pages for selection", {
      workspaceId: session.workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    const retryable = error instanceof FacebookOAuthError && error.retryable;
    return NextResponse.json(
      { error: retryable ? "Meta is temporarily unavailable. Try again in a moment." : "Could not load your Facebook Pages. Reconnect and try again." },
      { status: 502 },
    );
  }
}
