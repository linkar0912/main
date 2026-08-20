import { getServerEnv } from "@/src/lib/env";
import { processDeauthorization } from "@/src/lib/meta/deauthorization";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ status: "ok", message: "ReplyConnect deauthorization callback is available" });
}

export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.metaAppSecret) return new Response("Instagram app secret is not configured", { status: 503 });

  const form = await request.formData();
  const signedRequest = form.get("signed_request");
  if (typeof signedRequest !== "string") return new Response("signed_request is required", { status: 400 });

  const result = await processDeauthorization(signedRequest, env.metaAppSecret, getRepository());
  if (!result.ok) return new Response("Invalid signed request", { status: 403 });

  return Response.json({ success: true });
}
