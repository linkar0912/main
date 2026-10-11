import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { getEntitlementService } from "@/src/lib/entitlements/service";
import { MetaClient } from "@/src/lib/meta/client";
import { buildOnboardingPlan } from "@/src/lib/onboarding/build-plan";
import { readStoredAnswers } from "@/src/lib/onboarding/answers";
import type { PostSample } from "@/src/lib/onboarding/plan";
import { getRepository } from "@/src/lib/repository-provider";
import { unsealSecret } from "@/src/lib/security/secrets";

export const runtime = "nodejs";

/** The post block is a nice-to-have: never hold the plan up for Meta. */
const MEDIA_TIMEOUT_MS = 4_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

// GET /api/onboarding/plan - the "Your plan" step, computed on the server
// from the saved answers plus, when Instagram is connected, the comment counts
// on the account's most recent posts. Anything that cannot be read is left
// out rather than guessed.
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const env = getServerEnv();
  const repository = getRepository();
  const [onboarding, connections, pages, entitlements] = await Promise.all([
    repository.getWorkspaceOnboarding(session.workspaceId),
    repository.listConnections(session.workspaceId).catch(() => []),
    repository.listFacebookPages(session.workspaceId).catch(() => []),
    getEntitlementService().getEffectiveEntitlements(session.workspaceId).catch(() => null),
  ]);
  const answers = readStoredAnswers(onboarding?.answers);

  let instagram: { username: string; media: PostSample[] } | null = null;
  const connection = connections.find((item) => item.status === "CONNECTED");
  if (connection && env.metaTokenEncryptionKey) {
    try {
      const client = new MetaClient({ apiVersion: env.metaApiVersion });
      const page = await withTimeout(client.listMedia({
        igUserId: connection.igUserId,
        accessToken: unsealSecret(connection.accessTokenEncrypted, env.metaTokenEncryptionKey),
      }), MEDIA_TIMEOUT_MS);
      instagram = { username: connection.username, media: page.data };
    } catch {
      instagram = null;
    }
  }

  const facebookPageId = pages.find((page) => page.status === "CONNECTED")?.pageId;
  return NextResponse.json({
    data: buildOnboardingPlan({
      answers,
      currentPlan: entitlements?.planKey ?? "free",
      instagram,
      facebookPageId,
    }),
  });
}
