import { createHash } from "node:crypto";
import { getServerEnv } from "@/src/lib/env";
import {
  createDeletionConfirmationCode,
  createDeletionResponse,
  isFreshDeletionRequest,
  parseSignedRequest,
} from "@/src/lib/meta/data-deletion";
import { getRepository } from "@/src/lib/repository-provider";
import { deleteQueuedWorkspaceEventsBatch } from "@/src/lib/queue";
import { payloadTooLargeResponse, readBoundedFormData, RequestBodyTooLargeError } from "@/src/lib/security/request-body";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ status: "ok", message: "Linkar Facebook data deletion callback is available" });
}

export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.facebookAppSecret) return new Response("Facebook app secret is not configured", { status: 503 });
  let form: FormData;
  try {
    form = await readBoundedFormData(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return payloadTooLargeResponse();
    return new Response("signed_request is required", { status: 400 });
  }
  const signedRequest = form.get("signed_request");
  if (typeof signedRequest !== "string") return new Response("signed_request is required", { status: 400 });
  const payload = parseSignedRequest(signedRequest, env.facebookAppSecret);
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
  // Queued Facebook comment jobs hold comment text and sender names in Redis
  // keyed by page id. Clear them while the page ids are still known (before
  // the connection rows are deleted); an active job makes this throw so Meta
  // retries the callback instead of us reporting a deletion we did not do.
  const pageIds = await repository.listFacebookPageIdsByUserId(payload.user_id);
  if (pageIds.length > 0) await deleteQueuedWorkspaceEventsBatch(pageIds);
  if (!existing) {
    try {
      await repository.beginFacebookDataDeletion(payload.user_id, confirmationCode, signedRequestHash);
    } catch (error) {
      const winner = await repository.findDataDeletionByRequestHash(signedRequestHash);
      if (!winner) throw error;
      confirmationCode = winner.confirmationCode;
    }
  }
  // Catch anything enqueued between the first sweep and the row deletion.
  if (pageIds.length > 0) await deleteQueuedWorkspaceEventsBatch(pageIds);
  await repository.completeDataDeletion(confirmationCode);
  const statusUrl = new URL(`/data-deletion/status/${encodeURIComponent(confirmationCode)}`, env.appUrl).toString();
  return Response.json(createDeletionResponse(confirmationCode, statusUrl));
}
