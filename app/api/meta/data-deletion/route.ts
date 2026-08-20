import { getServerEnv } from "@/src/lib/env";
import { createHash } from "node:crypto";
import { createDeletionConfirmationCode, createDeletionResponse, parseSignedRequest } from "@/src/lib/meta/data-deletion";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ status: "ok", message: "ReplyConnect data deletion callback is available" });
}

export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.metaAppSecret) return new Response("Meta app secret is not configured", { status: 503 });

  const form = await request.formData();
  const signedRequest = form.get("signed_request");
  if (typeof signedRequest !== "string") return new Response("signed_request is required", { status: 400 });

  const payload = parseSignedRequest(signedRequest, env.metaAppSecret);
  if (!payload) return new Response("Invalid signed request", { status: 403 });

  const confirmationCode = createDeletionConfirmationCode();
  const userIdHash = createHash("sha256").update(payload.user_id).digest("hex");
  await getRepository().deleteInstagramData(payload.user_id, confirmationCode, userIdHash);
  const statusUrl = new URL(`/data-deletion/status/${encodeURIComponent(confirmationCode)}`, env.appUrl).toString();
  return Response.json(createDeletionResponse(confirmationCode, statusUrl));
}
