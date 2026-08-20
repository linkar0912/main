import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./signature";

describe("verifyWebhookSignature", () => {
  it("accepts a valid Meta sha256 signature", () => {
    const body = JSON.stringify({ hello: "world" });
    const secret = "app-secret";
    const digest = createHmac("sha256", secret).update(body).digest("hex");

    expect(verifyWebhookSignature(body, `sha256=${digest}`, secret)).toBe(true);
    expect(verifyWebhookSignature(body, `sha256=${digest.slice(0, -1)}0`, secret)).toBe(false);
  });

  it("rejects missing or malformed signatures", () => {
    expect(verifyWebhookSignature("body", null, "secret")).toBe(false);
    expect(verifyWebhookSignature("body", "md5=not-sha256", "secret")).toBe(false);
  });
});
