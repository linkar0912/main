// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingView } from "@/src/lib/onboarding/view";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { OnboardingScreen } = await import("./onboarding-screen");
const { ONBOARDING_DEFERRED_KEY, readOnboardingDeferral } = await import("@/src/lib/onboarding/redirect");

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

describe("OnboardingScreen saves", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function stubSaves(status: number) {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "PUT"
      ? { ok: false, status, json: async () => ({ error: status === 401 ? "Unauthorized" : "Bad gateway" }) }
      : { ok: true, status: 200, json: async () => ({ data: view({ step: 1, answers: {} }) }) });
    vi.stubGlobal("fetch", fetchMock);
    return () => fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
  }

  it("does not resend a step save after the session ended, and asks them to sign in again", async () => {
    const puts = stubSaves(401);
    render(<OnboardingScreen />);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("link", { name: "Sign in again" })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(puts()).toHaveLength(1);
    expect(JSON.parse(String(puts()[0][1]?.body))).toEqual({ step: 2, answers: { name: "Priya" } });
  });

  it("resends a step save the server could not take just now", async () => {
    const puts = stubSaves(502);
    render(<OnboardingScreen />);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Your answers didn’t save.");
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(puts().length).toBeGreaterThan(1);
  });
});

describe("OnboardingScreen when setup cannot load", () => {
  beforeEach(() => {
    router.push.mockReset();
    window.sessionStorage.clear();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.sessionStorage.clear();
  });

  function stubFailing() {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError("Unexpected token <"); } }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("holds the Home redirect off for this tab, so Go to Home does not bounce back", async () => {
    stubFailing();
    render(<OnboardingScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "Go to Home" }));
    expect(router.push).toHaveBeenCalledWith("/dashboard");
    expect(readOnboardingDeferral()).not.toBeNull();
  });

  it("clears the hold once setup loads", async () => {
    window.sessionStorage.setItem(ONBOARDING_DEFERRED_KEY, String(Date.now()));
    stubOnboarding(view({ step: 3 }));
    render(<OnboardingScreen />);
    await screen.findByRole("button", { name: "Skip for now" });
    expect(readOnboardingDeferral()).toBeNull();
  });

  it("makes Try again wait longer after each failure, and calms the message after three", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubFailing();
    render(<OnboardingScreen />);

    const retry = await screen.findByRole("button", { name: "Try again" }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("Your setup couldn’t load just now.");
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(retry.disabled).toBe(false);

    // Second failure: 4 s before it can be pressed again.
    fireEvent.click(retry);
    const second = await screen.findByRole("button", { name: "Try again" }) as HTMLButtonElement;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second.disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(second.disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(second.disabled).toBe(false);

    fireEvent.click(second);
    const third = await screen.findByRole("button", { name: "Try again" }) as HTMLButtonElement;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(third.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("Setup is taking longer than usual to load.");
    // Disabled buttons cannot fire again while cooling down.
    fireEvent.click(third);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
