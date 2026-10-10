import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as { workspaceId: string; email: string } | null,
  getAutomation: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getRequestSession: async () => state.session }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({ getAutomation: state.getAutomation }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const AutomationActivityPage = (await import("./page")).default;

function render(id: string) {
  return AutomationActivityPage({ params: Promise.resolve({ id }) });
}

describe("AutomationActivityPage", () => {
  afterEach(() => {
    state.session = null;
    state.getAutomation.mockReset();
  });

  it("404s an id that is unknown in (or foreign to) the signed-in workspace", async () => {
    state.session = { workspaceId: "workspace_1", email: "owner@example.com" };
    state.getAutomation.mockResolvedValue(null);

    await expect(render("someone_elses_automation")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.getAutomation).toHaveBeenCalledWith("workspace_1", "someone_elses_automation");
  });

  it("renders the page for an automation in the workspace", async () => {
    state.session = { workspaceId: "workspace_1", email: "owner@example.com" };
    state.getAutomation.mockResolvedValue({ id: "automation_1", name: "Guide", status: "ACTIVE" });

    await expect(render("automation_1")).resolves.toBeTruthy();
  });

  it("keeps the generic page when the lookup itself fails instead of claiming a 404", async () => {
    state.session = { workspaceId: "workspace_1", email: "owner@example.com" };
    state.getAutomation.mockRejectedValue(new Error("database unavailable"));

    await expect(render("automation_1")).resolves.toBeTruthy();
  });
});
