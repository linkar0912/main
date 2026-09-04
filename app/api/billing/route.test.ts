import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), view: vi.fn() }));
vi.mock("@/src/lib/billing/authorization", () => ({ requireBillingReader: mocks.guard }));
vi.mock("@/src/lib/billing/service", () => ({ getBillingService: () => ({ getBillingView: mocks.view }) }));
const { GET, runtime } = await import("./route");

describe("GET /api/billing", () => {
  beforeEach(() => {
    mocks.guard.mockReset().mockResolvedValue({ ok: true, role: "MEMBER", session: { workspaceId: "ws_1" } });
    mocks.view.mockReset().mockResolvedValue({ entitlementPlanKey: "free", canManage: false });
  });
  it("returns private uncached workspace billing state", async () => {
    const response = await GET(new Request("https://app.linkar.in/api/billing"));
    expect(runtime).toBe("nodejs");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ data: { entitlementPlanKey: "free", canManage: false } });
  });
});
