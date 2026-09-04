import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { MetaClient } from "@/src/lib/meta/client";
import { getRepository } from "@/src/lib/repository-provider";
import { unsealSecret } from "@/src/lib/security/secrets";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/contacts/[id]/avatar">) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const repository = getRepository();
  const contact = await repository.getContactById(session.workspaceId, id);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const env = getServerEnv();
  if (!env.metaTokenEncryptionKey) return new Response(null, { status: 404 });
  const connection = (await repository.listConnections(session.workspaceId))
    .find((item) => item.igUserId === contact.instagramAccountId && item.status === "CONNECTED");
  if (!connection) return new Response(null, { status: 404 });

  try {
    const profile = await new MetaClient({ apiVersion: env.metaApiVersion }).getUserProfile({
      igUserId: connection.igUserId,
      accessToken: unsealSecret(connection.accessTokenEncrypted, env.metaTokenEncryptionKey),
    }, contact.igScopedUserId);
    if (!profile.profilePictureUrl) return new Response(null, { status: 404 });
    return NextResponse.redirect(profile.profilePictureUrl, { status: 307 });
  } catch {
    return new Response(null, { status: 404 });
  }
}
