import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { FacebookClient } from "@/src/lib/facebook/client";
import { getRepository } from "@/src/lib/repository-provider";
import { unsealSecret } from "@/src/lib/security/secrets";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const pageId = params.get("pageId");
  const profileId = params.get("profileId");
  if (!pageId || !profileId) return NextResponse.json({ error: "Page and profile are required" }, { status: 400 });

  const env = getServerEnv();
  if (!env.facebookTokenEncryptionKey) return new Response(null, { status: 404 });
  const page = (await getRepository().listFacebookPages(session.workspaceId))
    .find((item) => item.pageId === pageId && item.status === "CONNECTED");
  if (!page) return new Response(null, { status: 404 });

  try {
    const pictureUrl = await new FacebookClient({
      apiVersion: env.facebookApiVersion,
      appSecret: env.facebookAppSecret,
    }).getProfilePictureUrl({
      pageId: page.pageId,
      accessToken: unsealSecret(page.accessTokenEncrypted, env.facebookTokenEncryptionKey),
    }, profileId);
    if (!pictureUrl) return new Response(null, { status: 404 });
    return NextResponse.redirect(pictureUrl, { status: 307 });
  } catch {
    return new Response(null, { status: 404 });
  }
}
