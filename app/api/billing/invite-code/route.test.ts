import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), redeem: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/src/lib/billing/authorization", () => ({ requireBillingOwner: mocks.guard }));
vi.mock("@/src/lib/billing/premium-invite", () => ({ getPremiumInviteService: () => ({ redeem: mocks.redeem }) }));
vi.mock("@/src/lib/entitlements/service", () => ({ getEntitlementService: () => ({ invalidateWorkspace: mocks.invalidate }) }));
import { POST } from "./route";

describe("POST /api/billing/invite-code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guard.mockResolvedValue({ ok: true, session: { workspaceId: "ws_1", userId: "user_1" }, role: "OWNER" });
    mocks.redeem.mockResolvedValue({ planId: "plan_agency", plan: { key: "agency", name: "Agency" }, expiresAt: "2026-10-05T00:00:00.000Z" });
  });

  it("redeems for the owner and invalidates cached entitlements", async () => {
    const response = await POST(new Request("https://app.linkar.in/api/billing/invite-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "LINKAR-ABCD" }) }));
    expect(response.status).toBe(200);
    expect(mocks.redeem).toHaveBeenCalledWith({ code: "LINKAR-ABCD", workspaceId: "ws_1", userId: "user_1" });
    expect(mocks.invalidate).toHaveBeenCalledWith("ws_1");
    await expect(response.json()).resolves.toEqual({
      data: {
        plan: { key: "agency", name: "Agency" },
        expiresAt: "2026-10-05T00:00:00.000Z",
      },
      refresh: true,
    });
  });

  it("rejects malformed JSON with a 400 instead of a server error", async () => {
    const response = await POST(new Request("https://app.linkar.in/api/billing/invite-code", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
    expect(mocks.redeem).not.toHaveBeenCalled();
  });

  it("rejects a well-formed body without a usable code with a 422", async () => {
    const response = await POST(new Request("https://app.linkar.in/api/billing/invite-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "x" }) }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "invite_code_invalid" });
    expect(mocks.redeem).not.toHaveBeenCalled();
  });

  it("returns a conflict for a used code", async () => {
    mocks.redeem.mockRejectedValue(new Error("invite_code_used"));
    const response = await POST(new Request("https://app.linkar.in/api/billing/invite-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "LINKAR-USED" }) }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "invite_code_used" });
  });
});
