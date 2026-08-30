import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import { readFacebookPageWebhookSubscription } from "@/src/lib/facebook/oauth";
import { unsealSecret } from "@/src/lib/security/secrets";
import { logger } from "@/src/lib/logger";

export const runtime = "nodejs";

const REQUIRED_FIELDS = ["feed"] as const;

/** GET: for each connected Page, attempt to re-subscribe to the webhook
 * fields and report which are confirmed vs missing. Parallel to the IG
 * /api/meta/connection/health endpoint so the settings UI can render one
 * status card per Page. */
export async function GET(request: Request) {
  const env = getServerEnv();
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pages = await getRepository().listFacebookPages(session.workspaceId);
  if (!env.facebookTokenEncryptionKey || !env.facebookAppId) {
    return NextResponse.json({ data: pages.map((page) => ({
      id: page.id,
      pageId: page.pageId,
      pageName: page.pageName,
      status: page.status,
      requiredFields: [...REQUIRED_FIELDS],
      subscribedFields: [],
      missingFields: [...REQUIRED_FIELDS],
      checkError: "Facebook App ID and token encryption must be configured",
    })) });
  }
  const tokenEncryptionKey = env.facebookTokenEncryptionKey;
  const facebookAppId = env.facebookAppId;
  const data = await Promise.all(pages.map(async (page) => {
    if (page.status !== "CONNECTED") {
      return {
        id: page.id,
        pageId: page.pageId,
        pageName: page.pageName,
        status: page.status,
        requiredFields: [...REQUIRED_FIELDS],
        subscribedFields: [],
        missingFields: [...REQUIRED_FIELDS],
      };
    }
    try {
      const accessToken = unsealSecret(page.accessTokenEncrypted, tokenEncryptionKey);
      const subscribed = await readFacebookPageWebhookSubscription(
        page.pageId,
        accessToken,
        env.facebookApiVersion,
        facebookAppId,
      );
      return {
        id: page.id,
        pageId: page.pageId,
        pageName: page.pageName,
        status: page.status,
        requiredFields: [...REQUIRED_FIELDS],
        subscribedFields: subscribed,
        missingFields: subscribed.length === REQUIRED_FIELDS.length ? [] : [...REQUIRED_FIELDS],
      };
    } catch (error) {
      logger.warn("Facebook webhook health check failed", {
        pageId: page.pageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        id: page.id,
        pageId: page.pageId,
        pageName: page.pageName,
        status: page.status,
        requiredFields: [...REQUIRED_FIELDS],
        subscribedFields: [],
        missingFields: [...REQUIRED_FIELDS],
        checkError: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }));
  return NextResponse.json({ data });
}
