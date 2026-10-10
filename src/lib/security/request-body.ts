/**
 * Bounded request-body readers for unauthenticated provider callbacks (Meta
 * webhooks, data-deletion and deauthorize callbacks). Those endpoints must
 * read the whole body before they can verify its signature, so without a cap
 * anyone can make the server buffer an arbitrarily large upload. Meta's real
 * payloads are a few kilobytes.
 */
export const PROVIDER_CALLBACK_MAX_BYTES = 1024 * 1024;

export class RequestBodyTooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`Request body exceeds ${limit} bytes`);
    this.name = "RequestBodyTooLargeError";
  }
}

/** Reads the body as bytes, rejecting early on Content-Length and while streaming. */
export async function readBoundedBytes(request: Request, maxBytes = PROVIDER_CALLBACK_MAX_BYTES): Promise<Uint8Array<ArrayBuffer>> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) throw new RequestBodyTooLargeError(maxBytes);
  if (!request.body) return new Uint8Array(new ArrayBuffer(0));

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RequestBodyTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readBoundedText(request: Request, maxBytes = PROVIDER_CALLBACK_MAX_BYTES): Promise<string> {
  return new TextDecoder().decode(await readBoundedBytes(request, maxBytes));
}

/** Parses a urlencoded or multipart form body after enforcing the size cap. */
export async function readBoundedFormData(request: Request, maxBytes = PROVIDER_CALLBACK_MAX_BYTES): Promise<FormData> {
  const bytes = await readBoundedBytes(request, maxBytes);
  const contentType = request.headers.get("content-type") ?? "application/x-www-form-urlencoded";
  return new Response(bytes, { headers: { "content-type": contentType } }).formData();
}

export function payloadTooLargeResponse(): Response {
  return new Response("Payload too large", { status: 413 });
}
