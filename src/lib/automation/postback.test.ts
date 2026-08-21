import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createInteractionPayload, readInteractionPayload } from "./postback";

const SECRET = "interaction-payload-secret";
const NOW = 1_755_750_000_000;
const TTL_MS = 24 * 60 * 60 * 1_000;
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function decodeBody(value: string): Record<string, unknown> {
  const [encodedBody] = value.split(".");
  return JSON.parse(Buffer.from(encodedBody, "base64url").toString("utf8")) as Record<string, unknown>;
}

function encodeBody(body: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(body)).toString("base64url");
}

function signBody(body: Record<string, unknown>, secret = SECRET): string {
  const encodedBody = encodeBody(body);
  const signature = createHmac("sha256", secret).update(encodedBody).digest("base64url");
  return `${encodedBody}.${signature}`;
}

function equivalentNonCanonicalBase64Url(value: string): string {
  const remainder = value.length % 4;
  if (remainder === 0) throw new Error("expected unused base64url bits");

  const unusedBits = remainder === 2 ? 4 : 2;
  const lastValue = BASE64URL_ALPHABET.indexOf(value.at(-1)!);
  const nonCanonicalLastValue = lastValue | 1;
  if ((nonCanonicalLastValue & ((1 << unusedBits) - 1)) === 0) throw new Error("failed to alter unused bits");

  return `${value.slice(0, -1)}${BASE64URL_ALPHABET[nonCanonicalLastValue]}`;
}

describe("signed interaction payloads", () => {
  it("round-trips the participant and action without exposing extra body values", () => {
    const value = createInteractionPayload({ participantId: "participant_123", action: "opt_in" }, SECRET, NOW);

    expect(decodeBody(value)).toEqual({
      v: 1,
      p: "participant_123",
      a: "opt_in",
      exp: NOW + TTL_MS,
    });
    expect(readInteractionPayload(value, SECRET, NOW + 1)).toEqual({
      participantId: "participant_123",
      action: "opt_in",
    });
  });

  it("round-trips the recheck action", () => {
    const value = createInteractionPayload({ participantId: "participant_123", action: "recheck" }, SECRET, NOW);

    expect(readInteractionPayload(value, SECRET, NOW)).toEqual({
      participantId: "participant_123",
      action: "recheck",
    });
  });

  it("rejects an altered signature", () => {
    const value = createInteractionPayload({ participantId: "participant_123", action: "opt_in" }, SECRET, NOW);
    const [body, signature] = value.split(".");
    const alteredSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;

    expect(readInteractionPayload(`${body}.${alteredSignature}`, SECRET, NOW)).toBeNull();
  });

  it("rejects altered participant or action references", () => {
    const value = createInteractionPayload({ participantId: "participant_123", action: "opt_in" }, SECRET, NOW);
    const [, signature] = value.split(".");
    const body = decodeBody(value);

    expect(readInteractionPayload(`${encodeBody({ ...body, p: "participant_456" })}.${signature}`, SECRET, NOW)).toBeNull();
    expect(readInteractionPayload(`${encodeBody({ ...body, a: "recheck" })}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it("rejects a signed payload with an unsupported action purpose", () => {
    const value = createInteractionPayload({ participantId: "participant_123", action: "opt_in" }, SECRET, NOW);
    const body = decodeBody(value);

    expect(readInteractionPayload(signBody({ ...body, a: "download_url" }), SECRET, NOW)).toBeNull();
  });

  it("rejects a padded body segment", () => {
    const value = createInteractionPayload({ participantId: "participant_123", action: "opt_in" }, SECRET, NOW);
    const [body] = value.split(".");
    const paddedBody = `${body}=`;
    const signature = createHmac("sha256", SECRET).update(paddedBody).digest("base64url");

    expect(readInteractionPayload(`${paddedBody}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it("rejects a padded signature segment", () => {
    const value = createInteractionPayload({ participantId: "participant_123", action: "opt_in" }, SECRET, NOW);
    const [body, signature] = value.split(".");

    expect(readInteractionPayload(`${body}.${signature}=`, SECRET, NOW)).toBeNull();
  });

  it("rejects an equivalent non-canonical body segment", () => {
    const value = createInteractionPayload({ participantId: "participant_123", action: "opt_in" }, SECRET, NOW);
    const [body] = value.split(".");
    const nonCanonicalBody = equivalentNonCanonicalBase64Url(body);
    const signature = createHmac("sha256", SECRET).update(nonCanonicalBody).digest("base64url");

    expect(readInteractionPayload(`${nonCanonicalBody}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it("rejects an equivalent non-canonical signature segment", () => {
    const value = createInteractionPayload({ participantId: "participant_123", action: "opt_in" }, SECRET, NOW);
    const [body, signature] = value.split(".");

    expect(readInteractionPayload(`${body}.${equivalentNonCanonicalBase64Url(signature)}`, SECRET, NOW)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(readInteractionPayload("", SECRET, NOW)).toBeNull();
    expect(readInteractionPayload("not-a-payload", SECRET, NOW)).toBeNull();
    expect(readInteractionPayload("body.signature.extra", SECRET, NOW)).toBeNull();
    expect(readInteractionPayload("%%%.$$$", SECRET, NOW)).toBeNull();
  });

  it("rejects a payload signed with a different secret", () => {
    const value = createInteractionPayload({ participantId: "participant_123", action: "opt_in" }, SECRET, NOW);

    expect(readInteractionPayload(value, "different-secret", NOW)).toBeNull();
  });

  it("rejects a payload at and after its 24-hour expiry", () => {
    const value = createInteractionPayload({ participantId: "participant_123", action: "opt_in" }, SECRET, NOW);

    expect(readInteractionPayload(value, SECRET, NOW + TTL_MS)).toBeNull();
    expect(readInteractionPayload(value, SECRET, NOW + TTL_MS + 1)).toBeNull();
  });
});
