import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDeletionResponse, parseSignedRequest } from "./data-deletion";

function signedRequest(payload: Record<string, unknown>, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${Buffer.from(JSON.stringify({ alg: "HMAC-SHA256", issued_at: 1 })).toString("base64url")}.${encodedPayload}.${signature}`;
}

describe("Meta data deletion", () => {
  it("accepts a valid signed request and rejects a tampered one", () => {
    const request = signedRequest({ user_id: "ig_123" }, "app-secret");
    expect(parseSignedRequest(request, "app-secret")).toEqual({ user_id: "ig_123" });
    expect(parseSignedRequest(`${request}tampered`, "app-secret")).toBeNull();
  });

  it("builds the callback response Meta expects", () => {
    expect(createDeletionResponse("ig_123", "https://dmsetu.example/data-deletion")).toMatchObject({
      url: "https://dmsetu.example/data-deletion",
      confirmation_code: expect.stringContaining("ig_123"),
    });
  });
});
