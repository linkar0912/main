import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDeletionResponse, isFreshDeletionRequest, parseSignedRequest } from "./data-deletion";

function signedRequest(payload: Record<string, unknown>, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${signature}.${encodedPayload}`;
}

describe("Meta data deletion", () => {
  it("accepts a valid signed request and rejects a tampered one", () => {
    const request = signedRequest({ algorithm: "HMAC-SHA256", user_id: "ig_123", issued_at: 1_700_000_000 }, "app-secret");
    expect(parseSignedRequest(request, "app-secret")).toEqual({ user_id: "ig_123", issued_at: 1_700_000_000 });
    expect(parseSignedRequest(`${request}tampered`, "app-secret")).toBeNull();
    expect(parseSignedRequest(signedRequest({ algorithm: "none", user_id: "ig_123" }, "app-secret"), "app-secret")).toBeNull();
  });

  it("rejects newly submitted signed requests outside the allowed age", () => {
    const request = signedRequest({ algorithm: "HMAC-SHA256", user_id: "ig_123", issued_at: 1_700_000_000 }, "app-secret");
    const payload = parseSignedRequest(request, "app-secret");
    expect(payload && isFreshDeletionRequest(payload, 1_700_000_000_000)).toBe(true);
    expect(payload && isFreshDeletionRequest(payload, 1_700_100_000_000)).toBe(false);
  });

  it("builds the callback response Meta expects", () => {
    expect(createDeletionResponse("replyconnect_delete_123", "https://replyconnect.example/data-deletion/status/replyconnect_delete_123")).toEqual({
      url: "https://replyconnect.example/data-deletion/status/replyconnect_delete_123",
      confirmation_code: "replyconnect_delete_123",
    });
  });
});
