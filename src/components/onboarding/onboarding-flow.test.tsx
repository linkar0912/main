// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOnboardingPlan } from "@/src/lib/onboarding/build-plan";
import type { OnboardingView } from "@/src/lib/onboarding/view";
import type { OnboardingClient } from "./onboarding-client";
import { OnboardingFlow } from "./onboarding-flow";

function ownerView(patch: Partial<OnboardingView> = {}): OnboardingView {
  return {
    flow: "owner",
    step: 1,
    answers: {},
    member: {},
    completedAt: null,
    skippedAt: null,
    suggestedName: "Priya",
    canConnect: true,
    connections: { instagram: [], facebook: [] },
    ...patch,
  };
}

function fakeClient(view: OnboardingView) {
  const client = {
    save: vi.fn(async () => view),
    loadPlan: vi.fn(async () => buildOnboardingPlan({ answers: { name: "Priya", goals: ["faq", "links"], dailyVolume: "10_50", replyMode: "myself" }, currentPlan: "free" })),
    listFacebookPages: vi.fn(async () => [{ id: "page_1", name: "Studio Priya" }]),
    selectFacebookPage: vi.fn(async () => undefined),
    connectHref: { instagram: "/api/meta/oauth/start?return=onboarding", facebook: "/api/facebook/oauth/start?return=onboarding" },
    navigate: vi.fn(),
  } satisfies OnboardingClient;
  return client;
}

afterEach(() => cleanup());

describe("OnboardingFlow (owner)", () => {
  it("prefills the name, saves each step and moves focus to the next question", async () => {
    const view = ownerView();
    const client = fakeClient(view);
    render(<OnboardingFlow view={view} client={client} />);

    expect(screen.getByRole("heading", { level: 1, name: "Let’s set Linkar up for you." })).toBeTruthy();
    const name = screen.getByLabelText("What should we call you?") as HTMLInputElement;
    expect(name.value).toBe("Priya");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "What best describes you, Priya?" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(client.save).toHaveBeenCalledWith({ step: 2, answers: { name: "Priya" } });
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("Step 2 of 9");
  });

  it("needs a choice before continuing, and number keys pick options", async () => {
    const view = ownerView({ step: 2 });
    const client = fakeClient(view);
    render(<OnboardingFlow view={view} client={client} />);

    const next = screen.getByRole("button", { name: "Continue" });
    expect(next.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(next);
    expect(client.save).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByRole("button", { name: /Brand or shop/ }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.keyDown(window, { key: "Enter" });
    expect(await screen.findByRole("heading", { level: 1, name: "What’s your space?" })).toBeTruthy();
    expect(client.save).toHaveBeenCalledWith({ step: 3, answers: { accountType: "brand" } });
  });

  it("goes back a step and Escape changes nothing", async () => {
    const view = ownerView({ step: 3, answers: { accountType: "coach" } });
    render(<OnboardingFlow view={view} client={fakeClient(view)} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("heading", { level: 1, name: "What’s your space?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { level: 1, name: /What best describes you/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Coach or educator/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("skips as skipped, not completed, and leaves for Home", async () => {
    const view = ownerView({ step: 4 });
    const client = fakeClient(view);
    render(<OnboardingFlow view={view} client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(client.navigate).toHaveBeenCalledWith("/dashboard"));
    expect(client.save).toHaveBeenCalledWith({ action: "skip" });
  });

  it("offers both connect flows with a way back into onboarding, or later", () => {
    const view = ownerView({ step: 7 });
    render(<OnboardingFlow view={view} client={fakeClient(view)} />);
    const links = screen.getAllByRole("link", { name: "Connect" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/api/meta/oauth/start?return=onboarding", "/api/facebook/oauth/start?return=onboarding"]);
    expect(screen.getByRole("button", { name: "I’ll do this later" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("shows the connected account and continues from it", () => {
    const view = ownerView({ step: 7, connections: { instagram: [{ username: "studio.priya", status: "CONNECTED" }], facebook: [] } });
    render(<OnboardingFlow view={view} client={fakeClient(view)} />);
    expect(screen.getByText("@studio.priya")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Connect" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("lands on the plan after a successful connect", async () => {
    const view = ownerView({ step: 7, connections: { instagram: [{ username: "studio.priya", status: "CONNECTED" }], facebook: [] } });
    const client = fakeClient(view);
    render(<OnboardingFlow view={view} client={client} connectReturn={{ meta: "connected" }} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Your setup." })).toBeTruthy();
    expect(client.save).toHaveBeenCalledWith({ step: 8 });
  });

  it("shows a readable message when a connect did not work", () => {
    const view = ownerView({ step: 7 });
    render(<OnboardingFlow view={view} client={fakeClient(view)} connectReturn={{ meta: "cancelled" }} />);
    expect(screen.getByRole("status").textContent).toMatch(/Nothing was connected/);
  });

  it("shows the plan with its assumptions, and Set up finishes onboarding first", async () => {
    const view = ownerView({ step: 8 });
    const client = fakeClient(view);
    render(<OnboardingFlow view={view} client={client} />);
    const hero = await screen.findByRole("region", { name: "Time Linkar can take off you" });
    expect(within(hero).getByText("About 4–6 hours a month saved")).toBeTruthy();
    expect(hero.textContent).toMatch(/about 30 comments and messages a day, about 5 in 10 of them about what you picked, and about 30 to 45 seconds/);
    const setUp = screen.getAllByRole("button", { name: /^Set up / });
    expect(setUp).toHaveLength(3);
    fireEvent.click(setUp[0]);
    await waitFor(() => expect(client.navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/automations\/new/)));
    expect(client.save).toHaveBeenCalledWith({ action: "complete" });
  });

  it("finishes with a confirmation and a way into Home", async () => {
    const view = ownerView({ step: 8 });
    const client = fakeClient(view);
    render(<OnboardingFlow view={view} client={client} />);
    await screen.findByRole("region", { name: "Time Linkar can take off you" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Finish" })); });
    expect(await screen.findByRole("heading", { level: 1, name: "You’re all set, Priya." })).toBeTruthy();
    expect(client.save).toHaveBeenCalledWith({ action: "complete" });
    fireEvent.click(screen.getByRole("button", { name: "Go to Home" }));
    expect(client.navigate).toHaveBeenCalledWith("/dashboard");
  });
});

describe("OnboardingFlow (team member)", () => {
  it("asks only for a name and what they will mainly do", async () => {
    const view: OnboardingView = { ...ownerView(), flow: "member", suggestedName: "Arjun", canConnect: false };
    const client = fakeClient(view);
    render(<OnboardingFlow view={view} client={client} />);
    expect(screen.getByRole("heading", { level: 1, name: "Welcome to the team." })).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("Step 1 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { level: 1, name: "What will you mainly do, Arjun?" });
    fireEvent.click(screen.getByRole("button", { name: /Reply in the inbox/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Finish" })); });
    expect(await screen.findByRole("heading", { level: 1, name: "You’re in, Arjun." })).toBeTruthy();
    expect(client.save).toHaveBeenLastCalledWith({ answers: { focus: "inbox" }, action: "complete" });
    fireEvent.click(screen.getByRole("button", { name: "Open the inbox" }));
    expect(client.navigate).toHaveBeenCalledWith("/activity");
  });
});
