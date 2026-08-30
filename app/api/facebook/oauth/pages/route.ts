import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { listFacebookPages } from "@/src/lib/facebook/oauth";
import { FACEBOOK_PAGE_SELECTION_COOKIE, readFacebookPageSelection } from "@/src/lib/facebook/page-selection";

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
  const pages = await listFacebookPages(selection.userAccessToken, env.facebookApiVersion);
  return NextResponse.json({
    data: pages.map(({ id, name, category }) => ({ id, name, ...(category ? { category } : {}) })),
  });
}
