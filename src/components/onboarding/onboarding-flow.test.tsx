// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildOnboardingPlan } from "@/src/lib/onboarding/build-plan";
import type { OnboardingView } from "@/src/lib/onboarding/view";
import { onboardingKnownNotRequired, readOnboardingDeferral } from "@/src/lib/onboarding/redirect";
import type { OnboardingClient, OnboardingSave } from "./onboarding-client";
import { createSaveQueue, OnboardingFlow, prefillName, SAVE_MAX_ATTEMPTS } from "./onboarding-flow";
import { NAME_MAX } from "@/src/lib/onboarding/answers";

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

describe("OnboardingFlow when a save fails", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.sessionStorage.clear();
  });

  // Fake time that only moves when told to: the automatic resend waits at
  // least 800 ms, so these steps never race it on a slow machine.
  const flush = (ms = 20) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

  it("sends a failed step's answers with the next save and keeps the warning until it is through", async () => {
    vi.useFakeTimers();
    const view = ownerView();
    const client = fakeClient(view);
    let finishSecond: ((value: OnboardingView) => void) | undefined;
    client.save
      .mockRejectedValueOnce(new Error("Bad gateway"))
      .mockImplementationOnce(() => new Promise<OnboardingView>((resolve) => { finishSecond = resolve; }));
    render(<OnboardingFlow view={view} client={client} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await flush();
    expect(screen.getByRole("heading", { level: 1, name: "What best describes you, Priya?" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Your answers didn’t save.");

    fireEvent.click(screen.getByRole("button", { name: /Brand or shop/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await flush();
    expect(screen.getByRole("heading", { level: 1, name: "What’s your space?" })).toBeTruthy();
    expect(client.save).toHaveBeenCalledTimes(2);
    expect(client.save).toHaveBeenNthCalledWith(1, { step: 2, answers: { name: "Priya" } });
    expect(client.save).toHaveBeenNthCalledWith(2, { step: 3, answers: { name: "Priya", accountType: "brand" } });
    // Still on screen while the save carrying the lost answers is in flight.
    expect(screen.getByText("Your answers didn’t save.", { exact: false })).toBeTruthy();

    await act(async () => { finishSecond?.(view); });
    await flush();
    expect(screen.queryByText("Your answers didn’t save.", { exact: false })).toBeNull();
    expect(client.save).toHaveBeenCalledTimes(2);
  });

  it("resends a failed step save by itself after a short wait", async () => {
    vi.useFakeTimers();
    const view = ownerView();
    const client = fakeClient(view);
    client.save.mockRejectedValueOnce(new Error("Bad gateway"));
    render(<OnboardingFlow view={view} client={client} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("Your answers didn’t save.");
    expect(client.save).toHaveBeenCalledTimes(1);

    await flush(1_000);
    expect(client.save).toHaveBeenCalledTimes(2);
    expect(client.save).toHaveBeenLastCalledWith({ step: 2, answers: { name: "Priya" } });
    await flush();
    expect(screen.queryByText("Your answers didn’t save.", { exact: false })).toBeNull();
  });

  it("Try again resends at once instead of waiting out the backoff", async () => {
    vi.useFakeTimers();
    const view = ownerView();
    const client = fakeClient(view);
    client.save.mockRejectedValueOnce(new Error("Bad gateway"));
    render(<OnboardingFlow view={view} client={client} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await flush();
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    await flush();
    expect(client.save).toHaveBeenCalledTimes(2);
    expect(client.save).toHaveBeenLastCalledWith({ step: 2, answers: { name: "Priya" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tells them to sign in again when the session has ended, and does not resend", async () => {
    vi.useFakeTimers();
    const view = ownerView();
    const client = fakeClient(view);
    client.save.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    render(<OnboardingFlow view={view} client={client} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await flush();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("You’ve been signed out, so your answers can’t save.");
    expect(within(alert).getByRole("link", { name: "Sign in again" }).getAttribute("href")).toBe("/login?next=/onboarding");
    expect(within(alert).queryByRole("button", { name: "Try again" })).toBeNull();

    await flush(10 * 60_000);
    expect(client.save).toHaveBeenCalledTimes(1);
  });

  it("saves the step after a connect return in turn with the other saves", async () => {
    const view = ownerView({ step: 7 });
    const client = fakeClient(view);
    let finishFirst: ((value: OnboardingView) => void) | undefined;
    client.save.mockImplementationOnce(() => new Promise<OnboardingView>((resolve) => { finishFirst = resolve; }));
    render(<OnboardingFlow view={view} client={client} connectReturn={{ meta: "connected" }} />);
    await waitFor(() => expect(client.save).toHaveBeenCalledWith({ step: 8 }));

    // Back to step 7 while the step 8 save is still in flight: it waits its turn.
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    await act(async () => { await Promise.resolve(); });
    expect(client.save).toHaveBeenCalledTimes(1);
    await act(async () => { finishFirst?.(view); });
    await waitFor(() => expect(client.save).toHaveBeenCalledTimes(2));
    expect(client.save).toHaveBeenLastCalledWith({ step: 7 });
  });

  it("still leaves for Home when a skip cannot be saved, and holds the redirect back off", async () => {
    const view = ownerView({ step: 4 });
    const client = fakeClient(view);
    client.save.mockRejectedValueOnce(new Error("Bad gateway"));
    render(<OnboardingFlow view={view} client={client} />);
    expect(readOnboardingDeferral()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(client.navigate).toHaveBeenCalledWith("/dashboard"));
    expect(readOnboardingDeferral()).not.toBeNull();
    expect(onboardingKnownNotRequired()).toBe(false);
  });

  it("does not hold the redirect off when the skip saved, and lets Home show at once", async () => {
    const view = ownerView({ step: 4 });
    const client = fakeClient(view);
    render(<OnboardingFlow view={view} client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(client.navigate).toHaveBeenCalledWith("/dashboard"));
    expect(readOnboardingDeferral()).toBeNull();
    expect(onboardingKnownNotRequired()).toBe(true);
  });
});

describe("OnboardingFlow with a long name from the email", () => {
  // 45 characters: more than the server's NAME_MAX (40).
  const longName = "Priya".repeat(9);

  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => window.sessionStorage.clear());

  /** A client whose saves the server refuses, as PUT /api/onboarding does, when a name is too long. */
  function strictClient(view: OnboardingView) {
    return {
      ...fakeClient(view),
      save: vi.fn(async (body: OnboardingSave) => {
        const name = (body.answers as { name?: string } | undefined)?.name;
        if (name !== undefined && name.length > NAME_MAX) throw Object.assign(new Error("Invalid onboarding answers"), { status: 400 });
        return view;
      }),
    } satisfies OnboardingClient;
  }

  it("prefills it cut to what the server accepts, so the step save and Skip both go through", async () => {
    const view = ownerView({ suggestedName: longName });
    const client = strictClient(view);
    render(<OnboardingFlow view={view} client={client} />);
    const name = screen.getByLabelText("What should we call you?") as HTMLInputElement;
    expect(name.value).toHaveLength(NAME_MAX);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { level: 1, name: /What best describes you/ });
    await waitFor(() => expect(client.save).toHaveBeenCalledWith({ step: 2, answers: { name: longName.slice(0, NAME_MAX) } }));

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(client.navigate).toHaveBeenCalledWith("/dashboard"));
    expect(client.save).toHaveBeenLastCalledWith({ action: "skip" });
    await expect(client.save.mock.results.at(-1)?.value).resolves.toBe(view);
    expect(onboardingKnownNotRequired()).toBe(true);
    expect(readOnboardingDeferral()).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lets an invited member finish", async () => {
    const view: OnboardingView = { ...ownerView(), flow: "member", suggestedName: longName, canConnect: false };
    const client = strictClient(view);
    render(<OnboardingFlow view={view} client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByRole("button", { name: /Reply in the inbox/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Finish" })); });
    expect(await screen.findByRole("heading", { level: 1, name: /You’re in/ })).toBeTruthy();
    expect(client.save).toHaveBeenLastCalledWith({ answers: { focus: "inbox" }, action: "complete" });
    for (const result of client.save.mock.results) await expect(result.value).resolves.toBe(view);
    expect(onboardingKnownNotRequired()).toBe(true);
  });

  it("still skips after the server refused an answer, instead of sending it again with the skip", async () => {
    const view = ownerView();
    const client = fakeClient(view);
    client.save.mockRejectedValueOnce(Object.assign(new Error("Invalid onboarding answers"), { status: 400 }));
    render(<OnboardingFlow view={view} client={client} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Your answers didn’t save.");
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(client.navigate).toHaveBeenCalledWith("/dashboard"));
    expect(client.save).toHaveBeenCalledTimes(2);
    expect(client.save).toHaveBeenLastCalledWith({ action: "skip" });
    expect(onboardingKnownNotRequired()).toBe(true);
    expect(readOnboardingDeferral()).toBeNull();
  });

  it("cuts names by what the server counts, after the same whitespace clean-up", () => {
    expect(prefillName("Priya")).toBe("Priya");
    expect(prefillName(longName)).toBe(longName.slice(0, NAME_MAX));
    expect(prefillName(`  ${"a ".repeat(30)}`)).toHaveLength(NAME_MAX - 1);
    // An emoji is never split in half.
    const emoji = prefillName(`${"a".repeat(NAME_MAX - 1)}😀`);
    expect(emoji).toBe("a".repeat(NAME_MAX - 1));
    expect(prefillName("   ")).toBeUndefined();
    expect(prefillName(null)).toBeUndefined();
    expect(prefillName(undefined)).toBeUndefined();
  });
});

describe("createSaveQueue", () => {
  function deferred() {
    let resolve!: (value: OnboardingView) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<OnboardingView>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  it("sends one save at a time and clears only the answers a save carried", async () => {
    const calls: Array<{ body: OnboardingSave; result: ReturnType<typeof deferred> }> = [];
    const save = vi.fn((body: OnboardingSave) => {
      const result = deferred();
      calls.push({ body, result });
      return result.promise;
    });
    const onFailing = vi.fn();
    const queue = createSaveQueue({ save, onSaved: () => undefined, onFailing, retryDelay: () => 0 });

    const first = queue.enqueue({ step: 2, answers: { name: "Priya" } });
    const second = queue.enqueue({ step: 3, answers: { accountType: "brand" } });
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(calls[0].body).toEqual({ step: 2, answers: { name: "Priya", accountType: "brand" } });

    calls[0].result.resolve(ownerView());
    await expect(first).resolves.toBe(true);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    // Both answers went with the first save, so the second carries only its step.
    expect(calls[1].body).toEqual({ step: 3 });
    calls[1].result.resolve(ownerView());
    await expect(second).resolves.toBe(true);
    expect(onFailing).toHaveBeenLastCalledWith(false);
  });

  it("keeps a failed save's answers for the next one and reports the failure", async () => {
    const save = vi.fn<(body: OnboardingSave) => Promise<OnboardingView>>()
      .mockRejectedValueOnce(new Error("Bad gateway"))
      .mockResolvedValue(ownerView());
    const onFailing = vi.fn();
    const queue = createSaveQueue({ save, onSaved: () => undefined, onFailing });

    await expect(queue.enqueue({ answers: { name: "Priya" }, action: "complete" })).resolves.toBe(false);
    expect(onFailing).toHaveBeenLastCalledWith(true);
    await expect(queue.enqueue({ step: 3, answers: { niches: ["fashion"] } })).resolves.toBe(true);
    expect(save).toHaveBeenLastCalledWith({ step: 3, answers: { name: "Priya", niches: ["fashion"] } });
    expect(onFailing).toHaveBeenLastCalledWith(false);
  });

  it("never resends a save the server refused, and reports a sign-out", async () => {
    vi.useFakeTimers();
    try {
      for (const status of [400, 401, 403]) {
        const save = vi.fn<(body: OnboardingSave) => Promise<OnboardingView>>().mockRejectedValue(Object.assign(new Error("Refused"), { status }));
        const onFailing = vi.fn();
        const onSignedOut = vi.fn();
        const queue = createSaveQueue({ save, onSaved: () => undefined, onFailing, onSignedOut, retryDelay: () => 1_000 });
        await expect(queue.enqueue({ step: 2, answers: { name: "Priya" } }, { retry: true })).resolves.toBe(false);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(save).toHaveBeenCalledTimes(1);
        expect(onFailing).toHaveBeenLastCalledWith(true);
        expect(onSignedOut).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops the answers of a refused save, so later saves, Skip and Finish are not refused with them", async () => {
    const save = vi.fn<(body: OnboardingSave) => Promise<OnboardingView>>()
      .mockRejectedValueOnce(Object.assign(new Error("Invalid onboarding answers"), { status: 400 }))
      .mockResolvedValue(ownerView());
    const onFailing = vi.fn();
    const queue = createSaveQueue({ save, onSaved: () => undefined, onFailing, retryDelay: () => 0 });

    await expect(queue.enqueue({ step: 2, answers: { name: "x".repeat(45) } }, { retry: true })).resolves.toBe(false);
    expect(onFailing).toHaveBeenLastCalledWith(true);
    await expect(queue.enqueue({ step: 3, answers: { accountType: "brand" } }, { retry: true })).resolves.toBe(true);
    expect(save).toHaveBeenLastCalledWith({ step: 3, answers: { accountType: "brand" } });
    await expect(queue.enqueue({ action: "skip" })).resolves.toBe(true);
    expect(save).toHaveBeenLastCalledWith({ action: "skip" });
    await expect(queue.enqueue({ action: "complete" })).resolves.toBe(true);
    expect(save).toHaveBeenLastCalledWith({ action: "complete" });
    expect(save).toHaveBeenCalledTimes(4);
    expect(onFailing).toHaveBeenLastCalledWith(false);
  });

  it("keeps an answer changed while the refused save was out, and every answer after a sign-out", async () => {
    let refuse!: (error: Error) => void;
    const save = vi.fn<(body: OnboardingSave) => Promise<OnboardingView>>()
      .mockImplementationOnce(() => new Promise<OnboardingView>((_resolve, reject) => { refuse = reject; }))
      .mockResolvedValue(ownerView());
    const queue = createSaveQueue({ save, onSaved: () => undefined, onFailing: () => undefined, retryDelay: () => 0 });
    const first = queue.enqueue({ step: 2, answers: { name: "x".repeat(45) } });
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    // They fixed the name before the refusal came back.
    const second = queue.enqueue({ step: 2, answers: { name: "Priya" } });
    refuse(Object.assign(new Error("Invalid onboarding answers"), { status: 400 }));
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
    expect(save).toHaveBeenLastCalledWith({ step: 2, answers: { name: "Priya" } });

    const signedOut = vi.fn<(body: OnboardingSave) => Promise<OnboardingView>>()
      .mockRejectedValueOnce(Object.assign(new Error("Unauthorized"), { status: 401 }))
      .mockResolvedValue(ownerView());
    const afterSignOut = createSaveQueue({ save: signedOut, onSaved: () => undefined, onFailing: () => undefined });
    await expect(afterSignOut.enqueue({ step: 2, answers: { name: "Priya" } })).resolves.toBe(false);
    await expect(afterSignOut.enqueue({ action: "skip" })).resolves.toBe(true);
    expect(signedOut).toHaveBeenLastCalledWith({ action: "skip", answers: { name: "Priya" } });
  });

  it("still resends after a timeout or a rate limit", async () => {
    vi.useFakeTimers();
    try {
      const save = vi.fn<(body: OnboardingSave) => Promise<OnboardingView>>()
        .mockRejectedValueOnce(Object.assign(new Error("Too many"), { status: 429 }))
        .mockRejectedValueOnce(Object.assign(new Error("Timeout"), { status: 408 }))
        .mockResolvedValue(ownerView());
      const queue = createSaveQueue({ save, onSaved: () => undefined, onFailing: () => undefined, retryDelay: () => 1_000 });
      const pending = queue.enqueue({ step: 2 }, { retry: true });
      await vi.advanceTimersByTimeAsync(2_500);
      await expect(pending).resolves.toBe(true);
      expect(save).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops resending on its own after a while, keeping the answers for Try again", async () => {
    vi.useFakeTimers();
    try {
      const save = vi.fn<(body: OnboardingSave) => Promise<OnboardingView>>().mockRejectedValue(Object.assign(new Error("Bad gateway"), { status: 502 }));
      const onFailing = vi.fn();
      const queue = createSaveQueue({ save, onSaved: () => undefined, onFailing, retryDelay: () => 30_000 });
      const pending = queue.enqueue({ step: 2, answers: { name: "Priya" } }, { retry: true });
      await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
      await expect(pending).resolves.toBe(false);
      expect(save).toHaveBeenCalledTimes(SAVE_MAX_ATTEMPTS);
      expect(onFailing).toHaveBeenLastCalledWith(true);

      save.mockResolvedValue(ownerView());
      queue.retryNow();
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenLastCalledWith({ step: 2, answers: { name: "Priya" } });
      expect(onFailing).toHaveBeenLastCalledWith(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits for a hidden tab to be visible again before resending", async () => {
    vi.useFakeTimers();
    let hidden = false;
    const visibility = vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    try {
      const save = vi.fn<(body: OnboardingSave) => Promise<OnboardingView>>()
        .mockRejectedValueOnce(new Error("Bad gateway"))
        .mockResolvedValue(ownerView());
      const queue = createSaveQueue({ save, onSaved: () => undefined, onFailing: () => undefined, retryDelay: () => 1_000 });
      hidden = true;
      const pending = queue.enqueue({ step: 2 }, { retry: true });
      await vi.advanceTimersByTimeAsync(60 * 60_000);
      expect(save).toHaveBeenCalledTimes(1);

      hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
      await expect(pending).resolves.toBe(true);
      expect(save).toHaveBeenCalledTimes(2);
    } finally {
      visibility.mockRestore();
      vi.useRealTimers();
    }
  });

  it("stops retrying once closed", async () => {
    vi.useFakeTimers();
    try {
      const save = vi.fn<(body: OnboardingSave) => Promise<OnboardingView>>().mockRejectedValue(new Error("Bad gateway"));
      const queue = createSaveQueue({ save, onSaved: () => undefined, onFailing: () => undefined, retryDelay: () => 1_000 });
      const pending = queue.enqueue({ step: 2 }, { retry: true });
      await vi.advanceTimersByTimeAsync(2_500);
      expect(save).toHaveBeenCalledTimes(3);
      queue.close();
      await expect(pending).resolves.toBe(false);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(save).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
