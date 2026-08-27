import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { MetaApiError, MetaClient } from "@/src/lib/meta/client";
import type { MetaMedia } from "@/src/lib/meta/types";
import { getRepository } from "@/src/lib/repository-provider";
import { unsealSecret } from "@/src/lib/security/secrets";

export const runtime = "nodejs";

const MAX_CURSOR_LENGTH = 500;

export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const env = getServerEnv();
  if (!env.metaTokenEncryptionKey) {
    return Response.json({ error: "Token encryption is not configured" }, { status: 503 });
  }

  const after = new URL(request.url).searchParams.get("after") ?? undefined;
  if (after !== undefined && (!after.trim() || after.length > MAX_CURSOR_LENGTH)) {
    return Response.json({ error: "Invalid cursor" }, { status: 400 });
  }

  try {
    const repository = getRepository();
    const connection = (await repository.listConnections(session.workspaceId))
      .find((item) => item.status === "CONNECTED");
    if (!connection) return Response.json({ error: "Connect Instagram first" }, { status: 409 });

    const client = new MetaClient({ apiVersion: env.metaApiVersion });
    const page = await client.listMedia({
      igUserId: connection.igUserId,
      accessToken: unsealSecret(connection.accessTokenEncrypted, env.metaTokenEncryptionKey),
    }, after);

    return Response.json({
      data: page.data.map(toPublicMedia),
      paging: { after: page.after },
    });
  } catch (error) {
    return mapMediaError(error);
  }
}

function toPublicMedia(media: MetaMedia): MetaMedia {
  const {
    id,
    caption,
    mediaType,
    mediaProductType,
    permalink,
    mediaUrl,
    thumbnailUrl,
    timestamp,
  } = media;
  return {
    id,
    ...(caption === undefined ? {} : { caption }),
    mediaType,
    ...(mediaProductType === undefined ? {} : { mediaProductType }),
    permalink,
    ...(mediaUrl === undefined ? {} : { mediaUrl }),
    ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
    timestamp,
  };
}

function mapMediaError(error: unknown): Response {
  if (error instanceof MetaApiError) {
    const status = error.status >= 400 && error.status <= 599 ? error.status : 502;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ error: "Unable to load media" }, { status: 502 });
}
