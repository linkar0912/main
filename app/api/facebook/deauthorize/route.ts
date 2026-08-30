import { getServerEnv } from "@/src/lib/env";
import { processFacebookDeauthorization } from "@/src/lib/facebook/deauthorization";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ status: "ok", message: "Linkar Facebook deauthorization callback is available" });
}

export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.facebookAppSecret) return new Response("Facebook app secret is not configured", { status: 503 });
  const signedRequest = (await request.formData()).get("signed_request");
  if (typeof signedRequest !== "string") return new Response("signed_request is required", { status: 400 });
  const result = await processFacebookDeauthorization(signedRequest, env.facebookAppSecret, getRepository());
  if (!result.ok) return new Response("Invalid signed request", { status: 403 });
  return Response.json({ success: true });
}
