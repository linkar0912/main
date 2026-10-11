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

function openInviteDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Create invite code" }));
  return screen.getByRole("dialog");
}

function openPlan(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.getByRole("dialog");
}

function fillInviteForm(planKey = "growth") {
  const planSelect = screen.getByRole("combobox", { name: "Invite plan" });
  const form = planSelect.closest("form");
  if (!form) throw new Error("Invite form not found");

  fireEvent.change(planSelect, { target: { value: planKey } });
  fireEvent.change(within(form).getByLabelText("Internal label"), { target: { value: "Launch cohort" } });
  fireEvent.change(within(form).getByLabelText(/^Reason/), { target: { value: "Creator launch" } });
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

    expect(screen.getByText("Launch cohort")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke Launch cohort" })).toBeTruthy();
    expect(screen.getByText(/Code does not expire/)).toBeTruthy();
    // The plan list shows a one-line summary; unlimited limits say so.
    expect(screen.getByText(/^Unlimited members, 50 automations/)).toBeTruthy();

    const dialog = openPlan("Edit Growth");
    expect(within(dialog).getByText(/7 workspaces on this plan/)).toBeTruthy();
    expect(within(dialog).getAllByLabelText("Members").some((input) => (input as HTMLInputElement).value === "")).toBe(true);
    expect(within(dialog).getByRole("button", { name: "Retire plan" })).toBeTruthy();
    expect(within(dialog).getByRole("checkbox", { name: "Exports", checked: true })).toBeTruthy();
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
    openInviteDialog();

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

  it("shows invite creation errors inside the dialog and keeps what was typed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "invite_plan_unavailable",
    }), { status: 422 })));

    render(<PlansScreen plans={[creatorPlan, growthPlan]} />);
    const dialog = openInviteDialog();
    fillInviteForm("creator");

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Invite plan unavailable");
    expect((within(dialog).getByLabelText("Internal label") as HTMLInputElement).value).toBe("Launch cohort");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

it("saves a plan without sending serialized timestamps or other response metadata", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<PlansScreen plans={[{ ...growthPlan, createdAt: "2026-01-01", updatedAt: "2026-01-02" } as typeof growthPlan]} />);
  const form = openPlan("Edit Growth");
  fireEvent.change(within(form).getByLabelText(/^Reason/), { target: { value: "Update limits" } });
  fireEvent.click(within(form).getByRole("button", { name: "Save plan" }));
  // The plan is assigned to 7 workspaces, so saving asks for a second confirmation.
  expect(fetchMock).not.toHaveBeenCalled();
  expect(within(form).getByText(/Saving changes the limits of 7 workspaces/)).toBeTruthy();
  fireEvent.click(within(form).getByRole("button", { name: "Confirm save" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
  expect(body.version).toBe(2);
  expect(body).not.toHaveProperty("createdAt"); expect(body).not.toHaveProperty("updatedAt");
});

describe("PlansScreen retirement", () => {
  it("asks for confirmation and a reason before retiring a plan", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PlansScreen plans={[growthPlan]} />);
    const card = openPlan("Edit Growth");

    fireEvent.click(within(card).getByRole("button", { name: "Retire plan" }));
    expect(fetchMock).not.toHaveBeenCalled();
    // Confirming without a reason used to send an empty reason that the server rejected.
    fireEvent.click(within(card).getByRole("button", { name: "Confirm retire" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(within(card).getByRole("alert").textContent).toContain("Add a reason before retiring a plan.");

    fireEvent.change(within(card).getByLabelText(/^Reason/), { target: { value: "Replaced by Scale" } });
    fireEvent.click(within(card).getByRole("button", { name: "Confirm retire" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/plans/p_growth", expect.objectContaining({ method: "DELETE", body: JSON.stringify({ version: 2 }) }));
  });

  it("keeps a retired plan read-only", () => {
    render(<PlansScreen plans={[retiredPlan]} />);
    const dialog = openPlan("View Retired Agency");
    expect(within(dialog).queryByRole("button", { name: "Save plan" })).toBeNull();
    expect(within(dialog).getByText(/Retired plans are read-only/)).toBeTruthy();
    expect(within(dialog).getByLabelText("Plan name").matches(":disabled")).toBe(true);
  });
});

describe("plan and invite safeguards", () => {
  it("does not offer retirement of the default free plan", () => {
    render(<PlansScreen plans={[freePlan]} />);
    const dialog = openPlan("Edit Free");
    expect(within(dialog).queryByRole("button", { name: "Retire plan" })).toBeNull();
    expect(within(dialog).getByText(/cannot be retired/)).toBeTruthy();
  });

  it("revokes a code through its own reason dialog and handles a code that no longer exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: "invite_code_not_found" }, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PlansScreen plans={[growthPlan]} inviteCodes={[{ id: "i1", label: "Launch cohort", durationDays: 30, expiresAt: "2026-12-01T00:00:00.000Z", revokedAt: null, createdAt: "2026-09-05T00:00:00.000Z", plan: { key: "growth", name: "Growth" }, redemption: null }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke Launch cohort" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^Reason/), { target: { value: "Campaign cancelled" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke code" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/invite-codes/i1", expect.objectContaining({ method: "DELETE" }));
    expect(decodeURIComponent(fetchMock.mock.calls[0][1].headers["x-admin-reason"])).toBe("Campaign cancelled");
    expect((await screen.findByRole("alert")).textContent).toContain("Launch cohort no longer exists");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ends active premium access from a redeemed code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { codeId: "i2" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PlansScreen plans={[growthPlan]} inviteCodes={[{ id: "i2", label: "Creator gift", durationDays: 30, expiresAt: null, revokedAt: null, createdAt: "2026-09-05T00:00:00.000Z", plan: { key: "growth", name: "Growth" }, redemption: { workspaceId: "workspace_1", startsAt: "2026-10-01T00:00:00.000Z", expiresAt: "2126-10-31T00:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z" } }]} />);
    fireEvent.click(screen.getByRole("button", { name: "End premium access from Creator gift" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^Reason/), { target: { value: "Abuse of promotion" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "End access" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/invite-codes/i2/access", expect.objectContaining({ method: "DELETE" })));
    expect((await screen.findByRole("status")).textContent).toContain("Premium access from Creator gift ended.");
  });
});
