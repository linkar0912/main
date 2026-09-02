import { getServerEnv } from "@/src/lib/env";
import { createHash } from "node:crypto";
import { createDeletionConfirmationCode, createDeletionResponse, isFreshDeletionRequest, parseSignedRequest } from "@/src/lib/meta/data-deletion";
import { getRepository } from "@/src/lib/repository-provider";
import { deleteQueuedInstagramEvents } from "@/src/lib/queue";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ status: "ok", message: "Linkar data deletion callback is available" });
}

export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.metaAppSecret) return new Response("Meta app secret is not configured", { status: 503 });

  const form = await request.formData();
  const signedRequest = form.get("signed_request");
  if (typeof signedRequest !== "string") return new Response("signed_request is required", { status: 400 });

  const payload = parseSignedRequest(signedRequest, env.metaAppSecret);
  if (!payload) return new Response("Invalid signed request", { status: 403 });

  const repository = getRepository();
  const signedRequestHash = createHash("sha256").update(signedRequest).digest("hex");
  const existing = await repository.findDataDeletionByRequestHash(signedRequestHash);
  if (existing?.status === "COMPLETED") {
    const statusUrl = new URL(`/data-deletion/status/${encodeURIComponent(existing.confirmationCode)}`, env.appUrl).toString();
    return Response.json(createDeletionResponse(existing.confirmationCode, statusUrl));
  }
  if (!existing && !isFreshDeletionRequest(payload)) return new Response("Expired signed request", { status: 403 });

  let confirmationCode = existing?.confirmationCode ?? createDeletionConfirmationCode();
  if (!existing) {
    try {
      await repository.beginInstagramDataDeletion(payload.user_id, confirmationCode, signedRequestHash);
    } catch (error) {
      // Two concurrent POSTs for the same signed request can both pass the
      // !existing check before either commits. The unique index on
      // signedRequestHash is the source of truth: re-read and continue with
      // the winner's confirmation code instead of failing the request.
      const winner = await repository.findDataDeletionByRequestHash(signedRequestHash);
      if (!winner) throw error;
      confirmationCode = winner.confirmationCode;
    }
  }
  await deleteQueuedInstagramEvents(payload.user_id);
  await repository.completeDataDeletion(confirmationCode);
  const statusUrl = new URL(`/data-deletion/status/${encodeURIComponent(confirmationCode)}`, env.appUrl).toString();
  return Response.json(createDeletionResponse(confirmationCode, statusUrl));
}
