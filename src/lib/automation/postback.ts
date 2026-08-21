import { createHmac, timingSafeEqual } from "node:crypto";

const INTERACTION_PAYLOAD_TTL_MS = 24 * 60 * 60 * 1_000;

type InteractionAction = "opt_in" | "recheck";

type InteractionPayloadBody = {
  v: 1;
  p: string;
  a: InteractionAction;
  exp: number;
};

export function isCanonicalBase64Url(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value) && Buffer.from(value, "base64url").toString("base64url") === value;
}

function sign(value: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(value).digest();
}

export function createInteractionPayload(
  input: { participantId: string; action: InteractionAction },
  secret: string,
  now = Date.now(),
): string {
  const body = {
    v: 1,
    p: input.participantId,
    a: input.action,
    exp: now + INTERACTION_PAYLOAD_TTL_MS,
  } satisfies InteractionPayloadBody;
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const signature = sign(encoded, secret).toString("base64url");
  return `${encoded}.${signature}`;
}

/**
 * Decodes and structurally validates the encoded payload half WITHOUT verifying the
 * signature or expiry. Used to cheaply recognize ReplyConnect interaction payloads
 * (e.g. to distinguish them from arbitrary user text before spending a signature check).
 */
export function decodeInteractionPayloadShape(encoded: string): { participantId: string; action: InteractionAction } | null {
  try {
    if (!isCanonicalBase64Url(encoded)) return null;
    const body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<InteractionPayloadBody>;
    if (
      body.v !== 1 ||
      typeof body.p !== "string" ||
      !body.p ||
      (body.a !== "opt_in" && body.a !== "recheck")
    ) return null;
    return { participantId: body.p, action: body.a };
  } catch {
    return null;
  }
}

export function readInteractionPayload(
  value: string,
  secret: string,
  now = Date.now(),
): { participantId: string; action: InteractionAction } | null {
  if (typeof value !== "string") return null;

  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encoded, encodedSignature] = parts;

  try {
    if (!isCanonicalBase64Url(encoded) || !isCanonicalBase64Url(encodedSignature)) return null;

    const expected = sign(encoded, secret);
    const actual = Buffer.from(encodedSignature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const shape = decodeInteractionPayloadShape(encoded);
    if (!shape) return null;

    const body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<InteractionPayloadBody>;
    if (
      typeof body.exp !== "number" ||
      !Number.isFinite(body.exp) ||
      body.exp <= now
    ) return null;

    return shape;
  } catch {
    return null;
  }
}
