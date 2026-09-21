import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { MetaClient } from "@/src/lib/meta/client";
import { resolveInstagramProfile } from "@/src/lib/meta/username-resolver";
import { getRepository } from "@/src/lib/repository-provider";

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

  // Goes through the shared 15-minute profile cache (username-resolver), so a
  // full contact list no longer fires one live Meta call per avatar <img>.
  // The 5-minute browser cache on the redirect further cuts repeat lookups;
  // the signed Meta CDN URL it points at outlives that comfortably.
  const profile = await resolveInstagramProfile({
    identity: { instagramAccountId: contact.instagramAccountId, igScopedUserId: contact.igScopedUserId },
    connection,
    client: new MetaClient({ apiVersion: env.metaApiVersion }),
    tokenEncryptionKey: env.metaTokenEncryptionKey,
    apiVersion: env.metaApiVersion,
  });
  if (!profile.profilePictureUrl) return new Response(null, { status: 404 });
  return NextResponse.redirect(profile.profilePictureUrl, {
    status: 307,
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
