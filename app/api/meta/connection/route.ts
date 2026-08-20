import { getRepository } from "@/src/lib/repository-provider";
import { getOwnerSessionFromRequest } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { MetaClient } from "@/src/lib/meta/client";
import { unsealSecret } from "@/src/lib/security/secrets";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = getOwnerSessionFromRequest(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const connections = await getRepository().listConnections(session.workspaceId);
  return Response.json({
    data: connections.map(({ id, igUserId, username, status, connectedAt }) => ({
      id,
      igUserId,
      username,
      status,
      connectedAt,
    })),
  });
}

export async function DELETE(request: Request) {
  const session = getOwnerSessionFromRequest(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const env = getServerEnv();
  if (!env.metaTokenEncryptionKey) return Response.json({ error: "Token encryption is not configured" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { id?: unknown };
  if (typeof body.id !== "string") return Response.json({ error: "Connection ID is required" }, { status: 400 });
  const connection = (await getRepository().listConnections(session.workspaceId)).find((item) => item.id === body.id);
  if (!connection) return Response.json({ error: "Connection not found" }, { status: 404 });

  const client = new MetaClient({ apiVersion: env.metaApiVersion });
  await client.unsubscribeFromWebhooks({
    igUserId: connection.igUserId,
    accessToken: unsealSecret(connection.accessTokenEncrypted, env.metaTokenEncryptionKey),
  });
  await getRepository().deleteConnection(session.workspaceId, connection.id);
  return Response.json({ disconnected: true });
}
