import { getRepository } from "@/src/lib/repository-provider";
import { getSessionFromRequest } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { MetaClient, MetaApiError } from "@/src/lib/meta/client";
import { unsealSecret } from "@/src/lib/security/secrets";

export const runtime = "nodejs";

export const REQUIRED_WEBHOOK_FIELDS = [
  "comments",
  "messages",
  "messaging_postbacks",
  "messaging_optins",
  "messaging_referral",
] as const;

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const env = getServerEnv();
  const connections = await getRepository().listConnections(session.workspaceId);

  const data = await Promise.all(connections.map(async (connection) => {
    const base = {
      id: connection.id,
      username: connection.username,
      status: connection.status,
      requiredFields: [...REQUIRED_WEBHOOK_FIELDS],
    };

    if (connection.status !== "CONNECTED" || !env.metaTokenEncryptionKey || !env.metaAppId) {
      return { ...base, subscribedFields: [], missingFields: [...REQUIRED_WEBHOOK_FIELDS], checkError: undefined };
    }

    try {
      const client = new MetaClient({ apiVersion: env.metaApiVersion });
      const subscribedFields = await client.getSubscribedFields({
        igUserId: connection.igUserId,
        accessToken: unsealSecret(connection.accessTokenEncrypted, env.metaTokenEncryptionKey),
      });
      const missingFields = REQUIRED_WEBHOOK_FIELDS.filter((field) => !subscribedFields.includes(field));
      return { ...base, subscribedFields, missingFields, checkError: undefined };
    } catch (error) {
      const message = error instanceof MetaApiError ? error.message : "Could not reach Meta to check webhook subscriptions";
      return { ...base, subscribedFields: [], missingFields: [...REQUIRED_WEBHOOK_FIELDS], checkError: message };
    }
  }));

  return Response.json({ data });
}
