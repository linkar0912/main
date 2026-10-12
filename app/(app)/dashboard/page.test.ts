import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/auth/session", () => ({
  getRequestSession: async () => ({ workspaceId: "workspace_1", email: "owner@example.com" }),
}));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ listAutomations: async () => { throw new Error("database unavailable"); } }),
}));
vi.mock("@/src/components/dashboard-screen", () => ({ DashboardScreen: function DashboardScreen() { return null; } }));

const DashboardPage = (await import("./page")).default;

describe("DashboardPage", () => {
  it("falls back to the client fetch when the server automation list fails", async () => {
    const result = await DashboardPage();
    expect(result.props).toMatchObject({ initialEmail: "owner@example.com", initialAutomations: undefined, initialRange: null });
  });

  it("opens on the window named in ?range= and ignores ones Home doesn't offer", async () => {
    expect((await DashboardPage({ searchParams: Promise.resolve({ range: "30" }) })).props.initialRange).toBe(30);
    expect((await DashboardPage({ searchParams: Promise.resolve({ range: "7" }) })).props.initialRange).toBe(7);
    expect((await DashboardPage({ searchParams: Promise.resolve({ range: "90" }) })).props.initialRange).toBeNull();
  });
});
