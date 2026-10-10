import { getServerEnv } from "@/src/lib/env";
import { processDeauthorization } from "@/src/lib/meta/deauthorization";
import { getRepository } from "@/src/lib/repository-provider";
import { payloadTooLargeResponse, readBoundedFormData, RequestBodyTooLargeError } from "@/src/lib/security/request-body";
import { ReplayGuard, SIGNED_CALLBACK_REPLAY_TTL_MS, screenSignedCallback } from "@/src/lib/security/replay-guard";

export const runtime = "nodejs";

let replayGuard: ReplayGuard | undefined;

export async function GET() {
  return Response.json({ status: "ok", message: "Linkar deauthorization callback is available" });
}

export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.metaAppSecret) return new Response("Instagram app secret is not configured", { status: 503 });

  let form: FormData;
  try {
    form = await readBoundedFormData(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return payloadTooLargeResponse();
    return new Response("signed_request is required", { status: 400 });
  }
  const signedRequest = form.get("signed_request");
  if (typeof signedRequest !== "string") return new Response("signed_request is required", { status: 400 });

  // Same issued_at freshness window as data deletion, plus a dedupe on the
  // exact signed request: a captured callback cannot be replayed later to
  // disconnect an account the owner has since reconnected.
  replayGuard ??= new ReplayGuard(env.redisUrl, "meta-deauthorize", SIGNED_CALLBACK_REPLAY_TTL_MS);
  const screened = await screenSignedCallback(signedRequest, env.metaAppSecret, replayGuard);
  if (screened.status === "invalid") return new Response("Invalid signed request", { status: 403 });
  if (screened.status === "expired") return new Response("Expired signed request", { status: 403 });
  if (screened.status === "duplicate") return Response.json({ success: true });

  try {
    const result = await processDeauthorization(signedRequest, env.metaAppSecret, getRepository());
    if (!result.ok) return new Response("Invalid signed request", { status: 403 });
  } catch (error) {
    // Let Meta's retry of this same request through.
    await replayGuard.release(screened.key);
    throw error;
  }

  return Response.json({ success: true });
}
