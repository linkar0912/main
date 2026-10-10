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
    expect(result.props).toMatchObject({ initialEmail: "owner@example.com", initialAutomations: undefined });
  });
});
