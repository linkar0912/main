import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { billingErrorResponse } = await import("./http");
const { BillingServiceError } = await import("./service");

describe("billing error responses", () => {
  it("returns a readable 409 when the workspace already has a subscription", async () => {
    const response = billingErrorResponse(new BillingServiceError("subscription_exists"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "subscription_exists",
      message: expect.stringContaining("Change plan"),
    });
  });

  it("keeps other billing errors code-only", async () => {
    const response = billingErrorResponse(new BillingServiceError("subscription_conflict"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "subscription_conflict" });
  });
});
