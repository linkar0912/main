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
vi.mock("@/src/components/automation-detail-frame", () => ({ AutomationDetailFrame: () => null }));

const AutomationDetailLayout = (await import("./layout")).default;

async function render(id: string) {
  const element = await AutomationDetailLayout({ children: null, params: Promise.resolve({ id }) });
  return element as { props: { automationId: string; initialAutomation?: unknown } };
}

describe("AutomationDetailLayout", () => {
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

  it("hands the automation to the shared header", async () => {
    state.session = { workspaceId: "workspace_1", email: "owner@example.com" };
    state.getAutomation.mockResolvedValue({ id: "automation_1", name: "Guide", status: "ACTIVE" });

    const element = await render("automation_1");
    expect(element.props.automationId).toBe("automation_1");
    expect(element.props.initialAutomation).toMatchObject({ name: "Guide" });
  });

  it("keeps a generic header when the lookup itself fails instead of claiming a 404", async () => {
    state.session = { workspaceId: "workspace_1", email: "owner@example.com" };
    state.getAutomation.mockRejectedValue(new Error("database unavailable"));

    const element = await render("automation_1");
    expect(element.props.initialAutomation).toBeUndefined();
  });
});
