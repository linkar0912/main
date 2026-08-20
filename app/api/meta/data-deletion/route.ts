import { getServerEnv } from "@/src/lib/env";
import { createDeletionResponse, parseSignedRequest } from "@/src/lib/meta/data-deletion";
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

  await getRepository().deleteConnectionByInstagramAccount(payload.user_id);
  return Response.json(createDeletionResponse(payload.user_id, new URL("/data-deletion", env.appUrl).toString()));
}
