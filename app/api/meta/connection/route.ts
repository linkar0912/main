import { getRepository } from "@/src/lib/repository-provider";
import { getSessionFromRequest } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import { MetaClient } from "@/src/lib/meta/client";
import { clearProfilePictureCache, loadProfilePictureUrl } from "@/src/lib/meta/profile-picture";
import { unsealSecret } from "@/src/lib/security/secrets";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const env = getServerEnv();
  const connections = await getRepository().listConnections(session.workspaceId);
  // The avatar is fetched live from Meta for each connection; any failure degrades
  // to null so the UI can fall back to the Instagram glyph.
  const data = await Promise.all(
    connections.map(async ({ id, igUserId, username, status, connectedAt, accessTokenEncrypted }) => ({
      id,
      igUserId,
      username,
      status,
      connectedAt,
      profilePictureUrl: await loadProfilePictureUrl(env, igUserId, accessTokenEncrypted),
    })),
  );
  return Response.json({ data });
}


export async function DELETE(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const env = getServerEnv();
  if (!env.metaTokenEncryptionKey) return Response.json({ error: "Token encryption is not configured" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { id?: unknown };
  if (typeof body.id !== "string") return Response.json({ error: "Connection ID is required" }, { status: 400 });
  const connection = (await getRepository().listConnections(session.workspaceId)).find((item) => item.id === body.id);
  if (!connection) return Response.json({ error: "Connection not found" }, { status: 404 });

  let remoteUnsubscribed = true;
  try {
    const client = new MetaClient({ apiVersion: env.metaApiVersion });
    await client.unsubscribeFromWebhooks({
      igUserId: connection.igUserId,
      accessToken: unsealSecret(connection.accessTokenEncrypted, env.metaTokenEncryptionKey),
    });
  } catch (error) {
    remoteUnsubscribed = false;
    logger.warn("Remote webhook unsubscribe failed during disconnect", {
      connectionId: connection.id,
      igUserId: connection.igUserId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await getRepository().expireParticipantsByInstagramAccount(connection.igUserId, "Instagram account disconnected");
  await getRepository().deleteConnection(session.workspaceId, connection.id);
  clearProfilePictureCache(connection.igUserId);
  return Response.json({ disconnected: true, remoteUnsubscribed });
}
