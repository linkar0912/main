// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingView } from "@/src/lib/onboarding/view";
import type { OnboardingSave } from "./onboarding-client";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { ONBOARDING_REQUEST_TIMEOUT_MS, OnboardingScreen } = await import("./onboarding-screen");
const { ONBOARDING_DEFERRED_KEY, onboardingKnownNotRequired, readOnboardingDeferral } = await import("@/src/lib/onboarding/redirect");

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

describe("OnboardingScreen when the server stops answering", () => {
  beforeEach(() => {
    router.push.mockReset();
    router.replace.mockReset();
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

  /** AbortSignal.timeout on the fake clock: the real one ignores vi.useFakeTimers. */
  function timeoutsOnFakeClock() {
    return vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), ms);
      return controller.signal;
    });
  }

  /** A request to a server that never answers: it only ends when aborted. */
  function hang(init?: RequestInit): Promise<Response> {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
  }

  const answer = (data: OnboardingView) => ({ ok: true, status: 200, json: async () => ({ data }) }) as unknown as Response;

  it("gives up on a step save that never answers, so Skip gets through in about 15 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const timeouts = timeoutsOnFakeClock();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== "PUT") return answer(view({ step: 1, answers: {} }));
      const body = JSON.parse(String(init.body)) as OnboardingSave;
      if (body.action === "skip") return answer(view({ skippedAt: "2026-10-16T10:00:00.000Z" }));
      return hang(init);
    });
    vi.stubGlobal("fetch", fetchMock);
    const puts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT").map(([, init]) => JSON.parse(String(init?.body)) as OnboardingSave);

    render(<OnboardingScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { level: 1, name: /What best describes you/ });
    expect(puts()).toEqual([{ step: 2, answers: { name: "Priya" } }]);

    // Skip waits its turn behind the hung save, but only until that save times out.
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(ONBOARDING_REQUEST_TIMEOUT_MS - 2_000); });
    expect(router.push).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard"));
    expect(puts().at(-1)).toEqual({ action: "skip", answers: { name: "Priya" } });
    expect(onboardingKnownNotRequired()).toBe(true);
    // Every request had the 15 s limit: the load, the step save and the skip.
    expect(timeouts.mock.calls.map(([ms]) => ms)).toEqual([ONBOARDING_REQUEST_TIMEOUT_MS, ONBOARDING_REQUEST_TIMEOUT_MS, ONBOARDING_REQUEST_TIMEOUT_MS]);
  });

  it("falls back to the deferral in bounded time when the skip never answers either", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    timeoutsOnFakeClock();
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "PUT" ? hang(init) : answer(view({ step: 3 }))));

    render(<OnboardingScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(ONBOARDING_REQUEST_TIMEOUT_MS + 500); });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard"));
    expect(readOnboardingDeferral()).not.toBeNull();
    expect(onboardingKnownNotRequired()).toBe(false);
  });

  it("shows the load as failed, and holds the Home redirect off, when setup never answers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    timeoutsOnFakeClock();
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => hang(init)));

    render(<OnboardingScreen />);
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(ONBOARDING_REQUEST_TIMEOUT_MS + 500); });
    expect((await screen.findByRole("alert")).textContent).toContain("Your setup couldn’t load just now.");
    expect(readOnboardingDeferral()).not.toBeNull();
    expect(screen.getByRole("button", { name: "Go to Home" })).toBeTruthy();
  });
});
