// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingView } from "@/src/lib/onboarding/view";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { OnboardingScreen } = await import("./onboarding-screen");

function view(patch: Partial<OnboardingView> = {}): OnboardingView {
  return {
    flow: "owner",
    step: 9,
    answers: { name: "Priya" },
    member: {},
    completedAt: null,
    skippedAt: null,
    suggestedName: "Priya",
    canConnect: true,
    connections: { instagram: [], facebook: [] },
    ...patch,
  };
}

function stubOnboarding(current: OnboardingView) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: current }) })));
}

const growthAnnual = { plan: "growth", interval: "ANNUAL" } as const;

describe("OnboardingScreen with a plan picked on /pricing", () => {
  beforeEach(() => router.push.mockReset());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("takes the owner from the last step to that plan's checkout in Billing", async () => {
    stubOnboarding(view());
    render(<OnboardingScreen planIntent={growthAnnual} />);
    fireEvent.click(await screen.findByRole("button", { name: "Go to Home" }));
    expect(router.push).toHaveBeenCalledWith("/settings?section=billing&plan=growth&interval=annual");
  });

  it("does the same when the owner skips the rest of onboarding", async () => {
    stubOnboarding(view({ step: 3 }));
    render(<OnboardingScreen planIntent={growthAnnual} />);
    fireEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/settings?section=billing&plan=growth&interval=annual"));
  });

  it("goes Home as usual without an intent, or for an invited member who cannot pay", async () => {
    stubOnboarding(view());
    render(<OnboardingScreen planIntent={null} />);
    fireEvent.click(await screen.findByRole("button", { name: "Go to Home" }));
    expect(router.push).toHaveBeenLastCalledWith("/dashboard");

    cleanup();
    stubOnboarding(view({ flow: "member", step: 3, member: { name: "Sam" }, canConnect: false }));
    render(<OnboardingScreen planIntent={growthAnnual} />);
    fireEvent.click(await screen.findByRole("button", { name: "Go to Home" }));
    expect(router.push).toHaveBeenLastCalledWith("/dashboard");
  });
});
