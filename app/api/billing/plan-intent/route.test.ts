import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.session }));
vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({ appUrl: "https://app.linkar.in", adminUrl: "https://admin.linkar.in", publicSiteUrl: "https://linkar.in" }),
}));
const { DELETE, runtime } = await import("./route");

const request = () => new Request("https://app.linkar.in/api/billing/plan-intent", { method: "DELETE" });

describe("DELETE /api/billing/plan-intent", () => {
  beforeEach(() => {
    mocks.session.mockReset().mockResolvedValue({ userId: "u1", email: "owner@acme.test", workspaceId: "w1" });
  });

  it("clears the remembered plan on the parent domain it was set on", async () => {
    const response = await DELETE(request());
    expect(runtime).toBe("nodejs");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("linkar_plan_intent=;");
    expect(cookie).toMatch(/Max-Age=0/i);
    expect(cookie).toMatch(/Domain=linkar\.in/i);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("needs a signed-in session", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await DELETE(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
