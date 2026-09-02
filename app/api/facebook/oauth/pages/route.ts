import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { listFacebookPages, FacebookOAuthError } from "@/src/lib/facebook/oauth";
import { FACEBOOK_PAGE_SELECTION_COOKIE, readFacebookPageSelection } from "@/src/lib/facebook/page-selection";
import { logger } from "@/src/lib/logger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const env = getServerEnv();
  if (!env.facebookTokenEncryptionKey) return NextResponse.json({ error: "Facebook is not configured" }, { status: 503 });
  const sealed = (await cookies()).get(FACEBOOK_PAGE_SELECTION_COOKIE)?.value;
  const selection = sealed
    ? readFacebookPageSelection(sealed, env.facebookTokenEncryptionKey, session.workspaceId)
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
