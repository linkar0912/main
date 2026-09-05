// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { PlansScreen } = await import("./plans-screen");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const growthPlan = {
  id: "p_growth",
  key: "growth",
  name: "Growth",
  isActive: true,
  version: 2,
  workspaceCount: 7,
  memberLimit: 5,
  automationLimit: 50,
  instagramConnectionLimit: 5,
  facebookConnectionLimit: 5,
  sequenceLimit: 25,
  monthlyBroadcastLimit: 10,
  monthlyDeliveryLimit: 25_000,
  sequencesEnabled: true,
  broadcastsEnabled: true,
  trackedLinksEnabled: true,
  teamEnabled: true,
  facebookEnabled: true,
  exportsEnabled: true,
};

const creatorPlan = {
  ...growthPlan,
  id: "p_creator",
  key: "creator",
  name: "Creator",
  workspaceCount: 3,
  memberLimit: 2,
  automationLimit: 20,
  instagramConnectionLimit: 2,
  facebookConnectionLimit: 2,
  monthlyBroadcastLimit: 0,
  monthlyDeliveryLimit: 5_000,
  broadcastsEnabled: false,
  exportsEnabled: false,
};

const freePlan = {
  ...creatorPlan,
  id: "p_free",
  key: "free",
  name: "Free",
};

const retiredPlan = {
  ...growthPlan,
  id: "p_retired",
  key: "retired",
  name: "Retired Agency",
  isActive: false,
};

function fillInviteForm(planKey = "growth") {
  const planSelect = screen.getByRole("combobox", { name: "Invite plan" });
  const form = planSelect.closest("form");
  if (!form) throw new Error("Invite form not found");

  fireEvent.change(planSelect, { target: { value: planKey } });
  fireEvent.change(within(form).getByLabelText("Internal label"), { target: { value: "Launch cohort" } });
  fireEvent.change(within(form).getByLabelText("Operator reason"), { target: { value: "Creator launch" } });
  fireEvent.click(within(form).getByRole("button", { name: "Generate code" }));
}

describe("PlansScreen", () => {
  it("renders nullable limits, assignments, features, retirement, and premium invite management", () => {
    render(<PlansScreen plans={[{ ...growthPlan, memberLimit: null }]} inviteCodes={[{
      id: "i1",
      label: "Launch cohort",
      durationDays: 30,
      expiresAt: null,
      revokedAt: null,
      createdAt: "2026-09-05T00:00:00.000Z",
      plan: { key: "agency", name: "Agency" },
      redemption: null,
    }]} />);

    expect(screen.getByText("7 assigned workspaces · Active")).toBeTruthy();
    expect(screen.getAllByLabelText("Members").some((input) => (input as HTMLInputElement).value === "")).toBe(true);
    expect(screen.getByRole("button", { name: "Retire plan" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Exports", checked: true })).toBeTruthy();
    expect(screen.getByText("Launch cohort")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeTruthy();
  });

  it("creates an invite for the selected active paid plan", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        code: "LINKAR-ABCD-EFGH-IJKL",
        plan: { key: "growth", name: "Growth" },
      },
    }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PlansScreen plans={[creatorPlan, growthPlan, freePlan, retiredPlan]} />);

    const planSelect = screen.getByRole("combobox", { name: "Invite plan" });
    expect(within(planSelect).getByRole("option", { name: "Creator" })).toBeTruthy();
    expect(within(planSelect).getByRole("option", { name: "Growth" })).toBeTruthy();
    expect(within(planSelect).queryByRole("option", { name: "Free" })).toBeNull();
    expect(within(planSelect).queryByRole("option", { name: "Retired Agency" })).toBeNull();

    fillInviteForm();
    expect(screen.getByText("Selected access").parentElement?.textContent).toContain("Growth");
    expect(screen.getByText("25,000")).toBeTruthy();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      label: "Launch cohort",
      planKey: "growth",
    });
    expect((await screen.findByRole("status")).textContent).toContain("Growth invite code created");
    expect(screen.getByText("LINKAR-ABCD-EFGH-IJKL")).toBeTruthy();
  });

  it("shows invite creation errors in a dismissible alert popup", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "invite_plan_unavailable",
    }), { status: 422 })));

    render(<PlansScreen plans={[creatorPlan, growthPlan]} />);
    fillInviteForm("creator");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("invite plan unavailable");
    fireEvent.click(within(alert).getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
