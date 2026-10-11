// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationBuilder } from "./automation-builder";
import type { FlowDefinitionV1, FlowDefinitionV2 } from "@/src/lib/automation/types";

type FetchOverrides = {
  media?: unknown;
  createResponse?: unknown;
  createOk?: boolean;
  patchResponse?: unknown;
  patchOk?: boolean;
  connection?: unknown;
  facebookPages?: unknown;
};

const defaultConnection = {
  id: "conn_default",
  igUserId: "17841400000000099",
  username: "default.brand",
  status: "CONNECTED",
  connectedAt: "2026-08-20T00:00:00.000Z",
};

function stubFetch(overrides: FetchOverrides = {}) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/meta/media")) {
      return { ok: true, json: async () => overrides.media ?? { data: [], paging: {} } } as Response;
    }
    if (url.endsWith("/api/meta/connection") || url.includes("/api/meta/connection?")) {
      // Every automation must be pinned to an account, so the default
      // workspace has one connected (tests that need none pass { data: [] }).
      return { ok: true, json: async () => overrides.connection ?? { data: [defaultConnection] } } as Response;
    }
    if (url.endsWith("/api/facebook/connection") || url.includes("/api/facebook/connection?")) {
      return { ok: true, json: async () => overrides.facebookPages ?? { data: [] } } as Response;
    }
    if (!init?.method || init.method === "POST") {
      return {
        ok: overrides.createOk ?? true,
        json: async () => overrides.createResponse ?? { data: { id: "automation_new" } },
      } as Response;
    }
    if (init.method === "PATCH") {
      return {
        ok: overrides.patchOk ?? true,
        json: async () => overrides.patchResponse ?? { data: { id: "automation_new" } },
      } as Response;
    }
    throw new Error(`Unhandled fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function findRequest(fetchMock: ReturnType<typeof stubFetch>, matcher: (url: string, init?: RequestInit) => boolean) {
  const call = fetchMock.mock.calls.find(([url, init]) => matcher(String(url), init as RequestInit | undefined));
  if (!call) throw new Error("No matching fetch call found");
  return call[1] as RequestInit;
}

const reel = {
  id: "media_1",
  caption: "Giveaway Reel",
  mediaType: "VIDEO" as const,
  mediaProductType: "REELS" as const,
  permalink: "https://www.instagram.com/reel/media_1/",
  mediaUrl: "https://cdn.example/media_1.mp4",
  thumbnailUrl: "https://cdn.example/media_1.jpg",
  timestamp: "2026-08-20T08:00:00.000Z",
};

async function fillRequiredCampaignFields() {
  fireEvent.change(screen.getByLabelText(/automation name/i), { target: { value: "Reel drop" } });
  fireEvent.change(screen.getByLabelText(/words to look for/i), { target: { value: "drop" } });
  fireEvent.change(screen.getByLabelText(/^reply 1$/i), { target: { value: "Check your messages." } });
  fireEvent.change(screen.getByLabelText(/^first message$/i), { target: { value: "Follow to unlock the link!" } });
  fireEvent.change(screen.getByLabelText(/message for people who don.t follow you yet/i), { target: { value: "Please follow first." } });
  fireEvent.change(screen.getByLabelText(/message to send with the link/i), { target: { value: "Here is your link." } });
  fireEvent.change(screen.getByLabelText(/link to send/i), { target: { value: "https://example.com/prize" } });
}

/** The wizard only mounts Save draft / Save & activate on its last (review) step. */
function goToReviewStep() {
  for (let i = 0; i < 5; i += 1) {
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
  }
}

describe("AutomationBuilder", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the reply avatar in the preview comments", () => {
    stubFetch();
    render(<AutomationBuilder />);

    const preview = screen.getByLabelText(/message preview/i);
    fireEvent.click(within(preview).getByRole("tab", { name: "Comments" }));
    // The business reply carries an avatar (photo when connected, default otherwise);
    // the other commenter always gets Instagram's no-photo default.
    const avatars = preview.querySelectorAll(".ig-avatar");
    expect(avatars.length).toBeGreaterThanOrEqual(2);
    expect(preview.querySelector(".ig-comment-nested .ig-avatar")).toBeTruthy();
  });

  it("presents the preview inside a premium phone device shell", () => {
    stubFetch();
    render(<AutomationBuilder />);

    const preview = screen.getByLabelText(/message preview/i);
    expect(preview.querySelector(".ig-device")).toBeTruthy();
    expect(preview.querySelector(".ig-statusbar-island")).toBeTruthy();
    expect(preview.querySelectorAll(".ig-device-button")).toHaveLength(3);
    expect(preview.querySelector(".ig-homebar")).toBeTruthy();
  });

  it("opens and closes the preview as a mobile sheet", () => {
    stubFetch();
    render(<AutomationBuilder />);

    // The accessible name matches the visible "Preview" label.
    fireEvent.click(screen.getByRole("button", { name: /^preview$/i }));
    expect(screen.getByLabelText(/message preview/i).classList.contains("is-open")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^close phone mockup$/i }));
    expect(screen.getByLabelText(/message preview/i).classList.contains("is-open")).toBe(false);
  });

  it("treats the open mobile preview as a dialog: focus moves in, Escape closes, focus returns", () => {
    stubFetch();
    render(<AutomationBuilder initialDefinition={{
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["menu"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Hi" }],
    }} />);

    const trigger = screen.getByRole("button", { name: /^preview$/i });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: /message preview/i })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^close phone mockup$/i }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByLabelText(/message preview/i).classList.contains("is-open")).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps editing version 1 definitions on the legacy single-reply form", async () => {
    const legacyDefinition: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Thanks!" }],
    };
    const fetchMock = stubFetch();

    render(<AutomationBuilder automationId="automation_1" initialDefinition={legacyDefinition} initialName="Legacy flow" />);

    expect(screen.queryByText("Flow v1")).toBeNull();
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH").length).toBe(1));
    const request = findRequest(fetchMock, (url) => url === "/api/automations/automation_1");
    expect(request.method).toBe("PATCH");
    expect(JSON.parse(String(request.body))).toMatchObject({
      definition: { version: 1, trigger: { type: "comment", keywords: ["guide"] } },
    });
  });

  it("lets a DM keyword flow add a second message, the way its own multi-action templates ship", async () => {
    // "Main menu", "Conversation starters" and "Price list responder" all prefill
    // two or three actions on a message trigger. Without this the button is hidden
    // for exactly those flows, so deleting one action makes it unrecoverable.
    stubFetch();
    const menuDefinition: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["menu"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Here's what I can help with" }],
    };
    render(<AutomationBuilder initialDefinition={menuDefinition} initialName="Main menu" />);

    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /add another message/i }));

    expect(within(screen.getByRole("group", { name: "Message 2" })).getByLabelText("Message text")).toBeTruthy();
  });

  it("warns at review when a template's placeholder links were never replaced, without blocking the save", async () => {
    // Every premade recipe ships example.com URLs. Activating one untouched used
    // to silently DM followers a dead link.
    const fetchMock = stubFetch();
    const fromTemplate: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["shop"] },
      conditions: [],
      actions: [{ type: "send_button", text: "Here you go", buttonLabel: "Shop now", url: "https://example.com/shop" }],
    };
    render(<AutomationBuilder initialDefinition={fromTemplate} initialName="Affiliate link" />);

    // A message trigger gets six stages: trigger, condition, action, email,
    // guardrails, review - so five Nexts land on review.
    for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByText(/still points at example\.com/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/automations")).toBe(true));
  });

  it("does not warn about placeholder links once they are replaced", () => {
    stubFetch();
    const edited: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["shop"] },
      conditions: [],
      actions: [{ type: "send_button", text: "Here you go", buttonLabel: "Shop now", url: "https://acme.test/shop" }],
    };
    render(<AutomationBuilder initialDefinition={edited} initialName="Affiliate link" />);

    for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("button", { name: /save draft/i })).toBeTruthy();
    expect(screen.queryByText(/still points at example\.com/i)).toBeNull();
  });

  it("saves follow-up nudges on the DM-side triggers whose editor offers them", async () => {
    // The nudge editor renders for every non-comment trigger, so first_contact
    // must persist them too - not just the keyword-matched message trigger.
    const fetchMock = stubFetch();
    const greeting: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "first_contact" },
      conditions: [],
      actions: [{ type: "send_text", text: "Hi there!" }],
    };
    render(<AutomationBuilder initialDefinition={greeting} initialName="Welcome" />);

    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /add a reminder message/i }));
    fireEvent.change(within(screen.getByRole("group", { name: "Reminder 1" })).getByLabelText("Reminder message"), { target: { value: "Still there?" } });
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/automations")).toBe(true));
    const request = findRequest(fetchMock, (url) => url === "/api/automations");
    expect(JSON.parse(String(request.body)).definition.followUps).toEqual([
      { delayMinutes: 1440, text: "Still there?" },
    ]);
  });

  it("shows a Facebook Page picker when a Page is connected and swaps the preview to the Facebook layout", async () => {
    const fetchMock = stubFetch({
      facebookPages: { data: [
        { id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED", connectedAt: "2026-08-29T10:00:00.000Z" },
      ] },
    });
    const legacyDefinition: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Thanks!" }],
    };

    render(<AutomationBuilder initialDefinition={legacyDefinition} initialName="FB flow" />);

    fireEvent.click(await screen.findByRole("radio", { name: /facebook page/i }));
    const pageSelect = await screen.findByLabelText("Facebook Page");
    expect(pageSelect).toBeTruthy();
    fireEvent.change(pageSelect, { target: { value: "12345" } });

    // Preview should now be the Facebook layout, not the Instagram phone shell.
    const preview = screen.getAllByLabelText(/message preview/i)[0] as HTMLElement;
    expect(preview.querySelector(".facebook-preview")).toBeTruthy();
    expect(screen.getByLabelText("Reply 1")).toBeTruthy();
    expect(preview.querySelector(".ig-device")).toBeNull();

    // Walk through the wizard and save; the request should carry the
    // facebookPageId and explicitly null the instagramAccountId so the API
    // does not see dual pins.
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST").length).toBe(1));
    const createRequest = findRequest(fetchMock, (url) => url === "/api/automations");
    const body = JSON.parse(String(createRequest.body)) as { provider?: string; facebookPageId?: string; instagramAccountId?: string | null };
    expect(body.provider).toBe("FACEBOOK");
    expect(body.facebookPageId).toBe("12345");
    expect(body.instagramAccountId).toBeNull();
  });

  it("uses the connected Facebook Page avatar throughout the live preview", async () => {
    const avatarUrl = "/api/facebook/avatar?pageId=12345&profileId=12345";
    stubFetch({
      facebookPages: { data: [
        {
          id: "fb_rec_1",
          pageId: "12345",
          pageName: "Acme Co",
          status: "CONNECTED",
          connectedAt: "2026-08-29T10:00:00.000Z",
          avatarUrl,
        },
      ] },
    });

    render(
      <AutomationBuilder
        initialFacebookPageId="12345"
        initialDefinition={{
          version: 1,
          trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
          conditions: [],
          actions: [{ type: "private_reply", text: "Thanks!" }],
        }}
      />,
    );

    const preview = screen.getAllByLabelText(/message preview/i)[0] as HTMLElement;
    await waitFor(() => {
      expect(
        Array.from(preview.querySelectorAll(".facebook-avatar img"), (image) => image.getAttribute("src")),
      ).toEqual([avatarUrl, avatarUrl]);
    });
  });

  it("saves and activates a Facebook Page automation in one request", async () => {
    const fetchMock = stubFetch({
      facebookPages: { data: [
        { id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED", connectedAt: "2026-08-29T10:00:00.000Z" },
      ] },
      createResponse: { data: { id: "automation_fb", status: "ACTIVE" } },
    });

    render(
      <AutomationBuilder
        initialName="Page replies"
        initialFacebookPageId="12345"
        initialDefinition={{
          version: 1,
          trigger: { type: "comment", match: "keyword", keywords: ["help"], mediaIds: [] },
          conditions: [],
          actions: [{ type: "private_reply", text: "We can help." }],
        }}
      />,
    );

    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("button", { name: /save draft/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /save and turn on/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/automations", expect.anything()));
    const request = findRequest(fetchMock, (url) => url === "/api/automations");
    expect(JSON.parse(String(request.body))).toMatchObject({ status: "ACTIVE", facebookPageId: "12345" });
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")).toBe(false);
    expect(await screen.findByText(/saved and turned on/i)).toBeTruthy();
  });

  it("shows a provider error when Facebook activation fails", async () => {
    stubFetch({
      facebookPages: { data: [
        { id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED", connectedAt: "2026-08-29T10:00:00.000Z" },
      ] },
      createOk: false,
      createResponse: { error: "Meta activation unavailable" },
    });

    render(
      <AutomationBuilder
        initialName="Page replies"
        initialFacebookPageId="12345"
        initialDefinition={{
          version: 1,
          trigger: { type: "comment", match: "keyword", keywords: ["help"], mediaIds: [] },
          conditions: [],
          actions: [{ type: "private_reply", text: "We can help." }],
        }}
      />,
    );

    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save and turn on/i }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Meta activation unavailable");
  });

  it("persists the complete Facebook Page comment policy", async () => {
    const fetchMock = stubFetch({
      facebookPages: { data: [
        { id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED", connectedAt: "2026-08-29T10:00:00.000Z" },
      ] },
    });
    const definition: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["price"], mediaIds: ["post_1"] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Thanks for asking." }],
    };

    render(
      <AutomationBuilder
        initialDefinition={definition}
        initialName="Page pricing"
        initialFacebookPageId="12345"
        initialPriority={4}
      />,
    );

    expect((await screen.findByLabelText("Facebook Page") as HTMLSelectElement).value).toBe("12345");
    fireEvent.change(screen.getByLabelText("How should the words match?"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Words to ignore"), { target: { value: "scam, spam" } });
    fireEvent.click(screen.getByLabelText("Reply once per person"));
    fireEvent.click(screen.getByRole("button", { name: "Add another version" }));
    fireEvent.change(screen.getByLabelText("Reply 2"), { target: { value: "Happy to help." } });
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("Daily limit"), { target: { value: "250" } });

    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/automations")).toBe(true));
    const request = findRequest(fetchMock, (url) => url === "/api/automations");
    expect(JSON.parse(String(request.body))).toMatchObject({
      provider: "FACEBOOK",
      facebookPageId: "12345",
      priority: 9,
      definition: {
        trigger: {
          type: "comment",
          mode: "all",
          negativeKeywords: ["scam", "spam"],
          replyOncePerUser: true,
          mediaIds: ["post_1"],
        },
        actions: [{ type: "private_reply", text: "Thanks for asking.", textVariants: ["Happy to help."] }],
        dailySendLimit: 250,
      },
    });
  });

  it("asks before leaving a configured Facebook target and preserves it when cancelled", async () => {
    stubFetch({
      facebookPages: { data: [
        { id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED", connectedAt: "2026-08-29T10:00:00.000Z" },
      ] },
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <AutomationBuilder
        initialName="Page replies"
        initialFacebookPageId="12345"
        initialDefinition={{
          version: 1,
          trigger: { type: "comment", match: "keyword", keywords: ["help"], mediaIds: [] },
          conditions: [],
          actions: [{ type: "private_reply", text: "We can help." }],
        }}
      />,
    );

    const facebook = await screen.findByRole("radio", { name: /facebook page/i }) as HTMLInputElement;
    expect(facebook.checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /instagram/i }));

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/selected Facebook Page/i));
    expect(facebook.checked).toBe(true);
    expect((screen.getByLabelText("Facebook Page") as HTMLSelectElement).value).toBe("12345");
  });

  it("shows lead webhook and custom-question controls without fulfillment email", () => {
    stubFetch();
    const definition: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [{ type: "send_text", text: "Welcome" }],
      emailCapture: {
        promptText: "What is your email?",
        confirmationText: "Saved",
      },
    };

    render(<AutomationBuilder initialDefinition={definition} />);

    expect(screen.getByLabelText("Send new leads to another app")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add question" })).toBeTruthy();
    expect(screen.queryByLabelText("Email subject")).toBeNull();
  });

  it("explains the classic builder in everyday language", () => {
    stubFetch();
    const definition: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Here is the guide." }],
    };

    render(<AutomationBuilder initialDefinition={definition} />);

    expect(screen.getAllByText("When it runs").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "When should this run?" })).toBeTruthy();
    expect(screen.getAllByText("What it sends").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Trigger$/i)).toBeNull();
    expect(screen.queryByText(/^Action$/i)).toBeNull();
  });

  it("defaults new automations to the version 2 campaign builder with sections in order", () => {
    stubFetch();
    render(<AutomationBuilder />);

    expect(screen.queryByText("Flow v2")).toBeNull();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent ?? "");
    const indexOf = (needle: RegExp) => headings.findIndex((text) => needle.test(text));
    const order = [
      "which posts should it watch",
      "which comments should it answer",
      "first DM",
      "what link should it send",
      "limits",
      "review and turn on",
    ].map(
      (word) => indexOf(new RegExp(word, "i")),
    );
    expect(order.every((value) => value >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("moves through the wizard one step at a time via Next/Back, only mounting Save actions on the last step", () => {
    stubFetch();
    render(<AutomationBuilder />);

    expect(screen.queryByRole("button", { name: /save draft/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^back$/i })).toBeNull();

    fireEvent.change(screen.getByLabelText(/automation name/i), { target: { value: "Sequential campaign" } });
    fireEvent.click(screen.getByRole("radio", { name: /all my posts/i }));
    fireEvent.change(screen.getByLabelText(/words to look for/i), { target: { value: "guide" } });

    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.change(screen.getByLabelText(/^reply 1$/i), { target: { value: "I’ll send it now." } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.change(screen.getByLabelText(/^first message$/i), { target: { value: "Tap below to continue." } });
    fireEvent.change(screen.getByLabelText(/message for people who don.t follow you yet/i), { target: { value: "Follow first, then try again." } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.change(screen.getByLabelText(/message to send with the link/i), { target: { value: "Here is your link." } });
    fireEvent.change(screen.getByLabelText(/link to send/i), { target: { value: "https://example.com/guide" } });

    for (let i = 0; i < 2; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    }

    expect(screen.queryByRole("button", { name: /^next$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /save draft/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /save and turn on/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByRole("button", { name: /^next$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /save draft/i })).toBeNull();
  });

  it("lets any campaign step be clicked and stops a jump at the first unfinished step", () => {
    stubFetch();
    render(<AutomationBuilder />);

    const secondStage = screen.getByRole("button", { name: /step 2: comments$/i });
    const reviewStage = screen.getByRole("button", { name: /: review$/i });
    expect(secondStage).toHaveProperty("disabled", false);
    expect(reviewStage).toHaveProperty("disabled", false);

    // Jumping straight to Review stays on the unfinished first step and says why.
    fireEvent.click(reviewStage);
    expect(screen.getByRole("alert").textContent).toBe("Give this automation a name first.");
    expect(screen.getByRole("heading", { name: /which posts should it watch/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/automation name/i), { target: { value: "Unlocked campaign" } });
    fireEvent.click(screen.getByRole("radio", { name: /all my posts/i }));
    fireEvent.change(screen.getByLabelText(/words to look for/i), { target: { value: "guide" } });

    // Once step 1 is finished, the jump goes as far as the next unfinished step.
    fireEvent.click(secondStage);
    expect(screen.getByRole("heading", { name: /what should it reply in the comments/i })).toBeTruthy();
  });

  it("lets any classic step be clicked once the steps before it are complete", () => {
    stubFetch();
    const legacyDefinition: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Thanks!" }],
    };
    render(<AutomationBuilder initialDefinition={legacyDefinition} initialName="Classic flow" />);

    const conditionStage = screen.getByRole("button", { name: /step 2: who gets it$/i });
    const reviewStage = screen.getByRole("button", { name: /: review$/i });
    expect(conditionStage).toHaveProperty("disabled", false);
    expect(reviewStage).toHaveProperty("disabled", false);

    // The trigger step is already complete here, so clicking step 2 opens it.
    fireEvent.click(conditionStage);
    expect(screen.getByRole("heading", { name: /who should it reply to/i })).toBeTruthy();

    // And earlier steps stay reachable for review.
    fireEvent.click(screen.getByRole("button", { name: /step 1: when it runs$/i }));
    expect(screen.getByRole("heading", { name: /when should this run/i })).toBeTruthy();
  });

  it("shows a step's validation error under the field it is about and focuses that field", () => {
    stubFetch();
    render(<AutomationBuilder />);

    fireEvent.click(screen.getByRole("radio", { name: /all my posts/i }));
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    const name = screen.getByLabelText(/automation name/i);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(name);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Give this automation a name first.");
    expect(name.getAttribute("aria-describedby")).toContain(alert.id);

    fireEvent.change(name, { target: { value: "Fixed" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(name.getAttribute("aria-invalid")).toBeNull();
  });

  it("only shows the media picker for the specific-media source and clears selections when switching away", async () => {
    stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByRole("radio", { name: /all my posts/i }));
    expect(screen.queryByRole("checkbox")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /posts i choose/i }));
    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("false");
  });

  it("preselects a Reel passed in from Quick Automation", async () => {
    stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder variant="campaign" initialMediaIds={["media_1"]} />);

    await waitFor(() => expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true"));
  });

  it("carries selected media snapshots into the submitted definition without transient URLs", async () => {
    const fetchMock = stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    goToReviewStep();
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = findRequest(fetchMock, (url) => url === "/api/automations");
    const body = JSON.parse(String(request.body));
    expect(body.definition.trigger.mediaIds).toEqual(["media_1"]);
    expect(body.definition.trigger.mediaSnapshots).toEqual([
      {
        id: "media_1",
        caption: "Giveaway Reel",
        mediaType: "VIDEO",
        mediaProductType: "REELS",
        permalink: "https://www.instagram.com/reel/media_1/",
        timestamp: "2026-08-20T08:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(body.definition.trigger.mediaSnapshots)).not.toContain("mediaUrl");
    expect(JSON.stringify(body.definition.trigger.mediaSnapshots)).not.toContain("thumbnailUrl");
  });

  it("blocks saving a specific-media campaign until a post or Reel is selected", async () => {
    const fetchMock = stubFetch();
    render(<AutomationBuilder />);
    await fillRequiredCampaignFields();

    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Select at least one post or Reel to watch.");
    // Clicking ahead in the stepper does not skip the missing post either.
    fireEvent.click(screen.getByRole("button", { name: /step 2: comments$/i }));
    expect(screen.getByRole("heading", { name: /which posts should it watch/i })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/automations", expect.anything());
  });

  it("switches between keyword and any-comment match modes, clearing keywords for any", async () => {
    const fetchMock = stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    fireEvent.change(screen.getByLabelText(/which comments count/i), { target: { value: "any" } });
    expect(screen.queryByLabelText(/words to look for/i)).toBeNull();

    goToReviewStep();
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = findRequest(fetchMock, (url) => url === "/api/automations");
    const body = JSON.parse(String(request.body));
    expect(body.definition.trigger).toMatchObject({ match: "any", keywords: [] });
  });

  it("supports up to five public reply variations and blocks adding a sixth", async () => {
    stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    const addButton = screen.getByRole("button", { name: /add another version/i });
    for (let i = 0; i < 4; i += 1) fireEvent.click(addButton);

    expect(screen.getAllByLabelText(/^reply \d$/i)).toHaveLength(5);
    expect(screen.getByRole("button", { name: /add another version/i })).toHaveProperty("disabled", true);
  });

  it("groups variation controls with their supporting copy", () => {
    stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    const helper = screen.getByText(/takes turns/i);
    expect(helper.closest(".builder-add-row")).toBeTruthy();
    expect(helper.closest(".builder-add-row")?.querySelector("button")?.textContent).toMatch(/add another version/i);
  });

  it("captures opening consent copy and the opt-in button label without a final URL leaking into the definition text", async () => {
    const fetchMock = stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    fireEvent.change(screen.getByLabelText(/^first message$/i), { target: { value: "Follow us to get the freebie." } });
    fireEvent.change(screen.getByLabelText(/^button they tap$/i), { target: { value: "Send it" } });

    goToReviewStep();
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = findRequest(fetchMock, (url) => url === "/api/automations");
    const body = JSON.parse(String(request.body));
    expect(body.definition.openingMessage).toEqual({ text: "Follow us to get the freebie.", optInButtonLabel: "Send it" });
    expect(body.definition.openingMessage.text).not.toContain("example.com/prize");
  });

  it("captures the follow-gate not-following message and recheck label", async () => {
    const fetchMock = stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    fireEvent.change(screen.getByLabelText(/message for people who don.t follow you yet/i), { target: { value: "Follow first, then tap below." } });
    fireEvent.change(screen.getByLabelText(/button they tap after following/i), { target: { value: "I followed" } });

    goToReviewStep();
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = findRequest(fetchMock, (url) => url === "/api/automations");
    const body = JSON.parse(String(request.body));
    expect(body.definition.followGate).toEqual({
      required: true,
      notFollowingMessage: "Follow first, then tap below.",
      recheckButtonLabel: "I followed",
    });
  });

  it("captures the final delivery text, URL, and optional button label", async () => {
    const fetchMock = stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    fireEvent.change(screen.getByLabelText(/link button text/i), { target: { value: "Open link" } });

    goToReviewStep();
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = findRequest(fetchMock, (url) => url === "/api/automations");
    const body = JSON.parse(String(request.body));
    expect(body.definition.delivery).toEqual({
      text: "Here is your link.",
      url: "https://example.com/prize",
      buttonLabel: "Open link",
    });
  });

  it("blocks non-HTTPS delivery links but permits http://localhost", async () => {
    const fetchMock = stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    fireEvent.change(screen.getByLabelText(/link to send/i), { target: { value: "http://example.com/prize" } });
    goToReviewStep();

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The link must start with https://");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/automations", expect.anything());

    fireEvent.change(screen.getByLabelText(/link to send/i), { target: { value: "http://localhost:3000/prize" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/automations", expect.anything()));
  });

  it("shows a live review summary that reflects entered campaign values", async () => {
    stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    goToReviewStep();

    const summary = screen.getByTestId("review-summary");
    expect(summary.textContent).toContain("drop");
    expect(summary.textContent).toContain("example.com/prize");
    const link = within(summary).getByRole("link", { name: /example\.com\/prize/i });
    expect(link.getAttribute("href")).toBe("https://example.com/prize");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("warns when the delivery link looks like two links pasted together, without blocking the field", async () => {
    stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();

    expect(screen.queryByText(/two links pasted together/i)).toBeNull();

    fireEvent.change(screen.getByLabelText(/link to send/i), {
      target: { value: "https://example.com/prizehttps://example.com/prize" },
    });
    expect(await screen.findByText(/two links pasted together/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/link to send/i), { target: { value: "https://example.com/prize" } });
    await waitFor(() => expect(screen.queryByText(/two links pasted together/i)).toBeNull());
  });

  it("shows the Instagram DM preview reflecting entered campaign copy, without leaking it before the DM view is selected", async () => {
    const fetchMock = stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    const callsBeforePreview = fetchMock.mock.calls.length;

    const preview = screen.getByLabelText(/message preview/i);
    expect(preview.textContent).not.toContain("Follow to unlock the link!");

    fireEvent.click(within(preview).getByRole("tab", { name: "DM" }));
    expect(preview.textContent).toContain("Follow to unlock the link!");
    expect(preview.textContent).toContain("Please follow first.");
    expect(preview.textContent).toContain("Here is your link.");

    expect(fetchMock.mock.calls.length).toBe(callsBeforePreview);
    expect(preview.textContent?.toLowerCase()).not.toContain("not sent to instagram");
    expect(preview.textContent).toContain("Instagram");
    expect(preview.textContent).not.toContain("Updated");
  });

  it("shows the connected account's handle and reel media in the phone preview, without its raw ID", async () => {
    const fetchMock = stubFetch({
      connection: { data: [{ id: "conn_1", igUserId: "17841400000000001", username: "brand.acct", status: "CONNECTED", connectedAt: "2026-08-20T00:00:00.000Z" }] },
      media: { data: [reel], paging: {} },
    });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));

    const preview = screen.getByLabelText(/message preview/i);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/meta/connection"))).toBe(true));
    await waitFor(() => expect(preview.textContent).toContain("@brand.acct"));
    expect(preview.textContent).not.toContain("17841400000000001");
    const postTab = within(preview).getByRole("tab", { name: "Post" });
    fireEvent.click(postTab);
    const reelImage = preview.querySelector<HTMLImageElement>(".ig-post-media.is-reel img");
    expect(reelImage?.getAttribute("src")).toBe("https://cdn.example/media_1.jpg");
  });

  it("saves a draft with POST when there is no automation ID yet", async () => {
    const fetchMock = stubFetch({ media: { data: [reel], paging: {} }, createResponse: { data: { id: "automation_9" } } });
    const onSaved = vi.fn();
    render(<AutomationBuilder onSaved={onSaved} />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    goToReviewStep();
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = findRequest(fetchMock, (url) => url === "/api/automations");
    expect(request.method).toBe("POST");
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(onSaved).toHaveBeenCalledWith({ id: "automation_9" });
  });

  it("pins a new campaign to its only connected Instagram account when saving", async () => {
    const fetchMock = stubFetch({
      connection: {
        data: [{
          id: "conn_1",
          igUserId: "17841401239924397",
          username: "probablymansi",
          status: "CONNECTED",
          connectedAt: "2026-09-03T00:00:00.000Z",
        }],
      },
      media: { data: [reel], paging: {} },
    });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    goToReviewStep();
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/automations", expect.anything()));
    const request = findRequest(fetchMock, (url) => url === "/api/automations");
    expect(JSON.parse(String(request.body)).instagramAccountId).toBe("17841401239924397");
  });

  it("saves and activates a new campaign in one POST", async () => {
    const fetchMock = stubFetch({
      media: { data: [reel], paging: {} },
      createResponse: { data: { id: "automation_9" } },
    });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    goToReviewStep();
    fireEvent.click(screen.getByRole("button", { name: /save and turn on/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/automations", expect.anything()));
    const createRequest = findRequest(fetchMock, (url) => url === "/api/automations");
    expect(createRequest.method).toBe("POST");
    expect(JSON.parse(String(createRequest.body))).toMatchObject({ status: "ACTIVE" });
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")).toBe(false);
  });

  it("saves an edited campaign as a draft in the same request as its definition", async () => {
    const existingDefinition: FlowDefinitionV2 = {
      version: 2,
      trigger: { type: "comment", source: "all_media", mediaIds: [], mediaSnapshots: [], match: "keyword", keywords: ["drop"] },
      publicReplies: ["Check your messages."],
      openingMessage: { text: "Open the DM.", optInButtonLabel: "Get it" },
      followGate: { required: false, notFollowingMessage: "", recheckButtonLabel: "" },
      delivery: { text: "Here is your link.", url: "https://example.com/old" },
    };
    const fetchMock = stubFetch({ patchResponse: { data: { id: "automation_edit", status: "DRAFT" } } });
    render(<AutomationBuilder automationId="automation_edit" initialName="Existing campaign" initialDefinition={existingDefinition} />);

    goToReviewStep();
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/automations/automation_edit", expect.anything()));
    const request = findRequest(fetchMock, (url) => url === "/api/automations/automation_edit");
    expect(JSON.parse(String(request.body))).toMatchObject({
      status: "DRAFT",
      definition: existingDefinition,
    });
  });

  it("updates and activates an edited campaign with one PATCH", async () => {
    const existingDefinition: FlowDefinitionV2 = {
      version: 2,
      trigger: { type: "comment", source: "all_media", mediaIds: [], mediaSnapshots: [], match: "any", keywords: [] },
      publicReplies: ["Check your messages."],
      openingMessage: { text: "Open the DM.", optInButtonLabel: "Get it" },
      followGate: { required: false, notFollowingMessage: "", recheckButtonLabel: "" },
      delivery: { text: "Edited delivery.", url: "https://example.com/edited" },
    };
    const fetchMock = stubFetch({ patchResponse: { data: { id: "automation_edit", status: "ACTIVE" } } });
    render(<AutomationBuilder automationId="automation_edit" initialName="Existing campaign" initialDefinition={existingDefinition} />);

    goToReviewStep();
    fireEvent.click(screen.getByRole("button", { name: /save and turn on/i }));

    await waitFor(() => {
      const saves = fetchMock.mock.calls.filter(([url, init]) => (
        String(url) === "/api/automations/automation_edit" && (init as RequestInit)?.method === "PATCH"
      ));
      expect(saves).toHaveLength(1);
    });
    const request = findRequest(fetchMock, (url) => url === "/api/automations/automation_edit");
    expect(JSON.parse(String(request.body))).toMatchObject({
      status: "ACTIVE",
      definition: existingDefinition,
    });
  });

  it("opens every step immediately when editing an existing campaign", () => {
    const existingDefinition: FlowDefinitionV2 = {
      version: 2,
      trigger: { type: "comment", source: "all_media", mediaIds: [], mediaSnapshots: [], match: "any", keywords: [] },
      publicReplies: ["Check your messages."],
      openingMessage: { text: "Open the DM.", optInButtonLabel: "Get it" },
      followGate: { required: false, notFollowingMessage: "", recheckButtonLabel: "" },
      delivery: { text: "Here is the link.", url: "https://example.com/item" },
    };
    stubFetch();
    render(<AutomationBuilder automationId="automation_edit" initialName="Existing campaign" initialDefinition={existingDefinition} />);

    const review = screen.getByRole("button", { name: /: review$/i });
    expect((review as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(review);
    expect(screen.getByRole("heading", { name: /review and turn on/i }).closest(".wizard-step")?.classList.contains("is-hidden")).toBe(false);
  });

  it("rehydrates and persists campaign priority", async () => {
    const existingDefinition: FlowDefinitionV2 = {
      version: 2,
      trigger: { type: "comment", source: "all_media", mediaIds: [], mediaSnapshots: [], match: "any", keywords: [] },
      publicReplies: ["Check your messages."],
      openingMessage: { text: "Open the DM.", optInButtonLabel: "Get it" },
      followGate: { required: false, notFollowingMessage: "", recheckButtonLabel: "" },
      delivery: { text: "Here is the link.", url: "https://example.com/item" },
    };
    const fetchMock = stubFetch();
    render(<AutomationBuilder automationId="automation_edit" initialName="Existing campaign" initialDefinition={existingDefinition} initialPriority={8} />);

    fireEvent.click(screen.getByRole("button", { name: /limits/i }));
    expect((screen.getByLabelText(/^priority$/i) as HTMLInputElement).value).toBe("8");
    fireEvent.change(screen.getByLabelText(/^priority$/i), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: /: review$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/automations/automation_edit", expect.anything()));
    const request = findRequest(fetchMock, (url) => url === "/api/automations/automation_edit");
    expect(JSON.parse(String(request.body)).priority).toBe(11);
  });

  it("shows API codes as a readable popup instead of raw text below the form", async () => {
    const existingDefinition: FlowDefinitionV2 = {
      version: 2,
      trigger: { type: "comment", source: "all_media", mediaIds: [], mediaSnapshots: [], match: "any", keywords: [] },
      publicReplies: ["Check your messages."],
      openingMessage: { text: "Open the DM.", optInButtonLabel: "Get it" },
      followGate: { required: false, notFollowingMessage: "", recheckButtonLabel: "" },
      delivery: { text: "Here is the link.", url: "https://example.com/item" },
    };
    stubFetch({ patchOk: false, patchResponse: { error: "invalid_channel_target" } });
    render(<AutomationBuilder automationId="automation_edit" initialName="Existing campaign" initialDefinition={existingDefinition} />);

    fireEvent.click(screen.getByRole("button", { name: /: review$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Choose a connected Instagram account or Facebook Page.");
    expect(alert.classList.contains("action-notice")).toBe(true);
  });

  it("submits the full version 2 JSON shape expected by the API", async () => {
    const fetchMock = stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    fireEvent.change(screen.getByLabelText(/^button they tap$/i), { target: { value: "Send it" } });
    fireEvent.change(screen.getByLabelText(/button they tap after following/i), { target: { value: "I followed" } });
    goToReviewStep();
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = findRequest(fetchMock, (url) => url === "/api/automations");
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      provider: "INSTAGRAM",
      name: "Reel drop",
      definition: {
        version: 2,
        trigger: {
          type: "comment",
          source: "specific_media",
          mediaIds: ["media_1"],
          match: "keyword",
          keywords: ["drop"],
        },
        openingMessage: { text: "Follow to unlock the link!", optInButtonLabel: "Send it" },
        followGate: { required: true, notFollowingMessage: "Please follow first.", recheckButtonLabel: "I followed" },
        delivery: { text: "Here is your link.", url: "https://example.com/prize" },
      },
    });
    expect(Array.isArray(body.definition.publicReplies)).toBe(true);
  });

  it("dedupes keywords case-insensitively so the server's post-normalization uniqueness check never 400s", async () => {
    const fetchMock = stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    fireEvent.change(screen.getByLabelText(/words to look for/i), { target: { value: "Guide, guide, GUIDE , help" } });
    goToReviewStep();
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = findRequest(fetchMock, (url) => url === "/api/automations");
    const body = JSON.parse(String(request.body));
    expect(body.definition.trigger.keywords).toEqual(["Guide", "help"]);
  });

  it("exercises the next-media trigger source, hiding the picker and saving an empty next_media trigger", async () => {
    const fetchMock = stubFetch();
    render(<AutomationBuilder />);

    fireEvent.click(screen.getByRole("radio", { name: /my next post/i }));
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByTestId("review-summary").textContent).toContain("next post you publish");

    await fillRequiredCampaignFields();
    goToReviewStep();
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = findRequest(fetchMock, (url) => url === "/api/automations");
    const body = JSON.parse(String(request.body));
    expect(body.definition.trigger).toMatchObject({ source: "next_media", mediaIds: [], mediaSnapshots: [] });
  });

  it("preserves a previously saved media snapshot that this session never re-fetched when editing and toggling an unrelated item", async () => {
    const previouslySelectedSnapshot = {
      id: "media_page2",
      caption: "Selected in an earlier session, lives on a later page",
      mediaType: "VIDEO" as const,
      mediaProductType: "REELS" as const,
      permalink: "https://www.instagram.com/reel/media_page2/",
      timestamp: "2026-08-10T08:00:00.000Z",
    };
    const existingDefinition: FlowDefinitionV2 = {
      version: 2,
      trigger: {
        type: "comment",
        source: "specific_media",
        mediaIds: ["media_page2"],
        mediaSnapshots: [previouslySelectedSnapshot],
        match: "keyword",
        keywords: ["drop"],
      },
      publicReplies: ["Nice!"],
      openingMessage: { text: "Follow to unlock the link!", optInButtonLabel: "Get it" },
      followGate: { required: true, notFollowingMessage: "Please follow first.", recheckButtonLabel: "I followed" },
      delivery: { text: "Here is your link.", url: "https://example.com/prize" },
    };
    // Only `reel` (a different, already-fetched item) is ever returned by the mocked API -
    // `media_page2` is never re-fetched, simulating it living on a page this editor never loads.
    const fetchMock = stubFetch({ media: { data: [reel], paging: {} } });

    render(
      <AutomationBuilder automationId="automation_edit" initialName="Existing campaign" initialDefinition={existingDefinition} />,
    );

    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(1));
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("checkbox"));

    goToReviewStep();
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/automations/automation_edit", expect.anything()));
    const request = findRequest(fetchMock, (url) => url === "/api/automations/automation_edit");
    const body = JSON.parse(String(request.body));
    expect(body.definition.trigger.mediaIds).toEqual(["media_page2", "media_1"]);
    expect(body.definition.trigger.mediaSnapshots).toEqual([
      previouslySelectedSnapshot,
      {
        id: "media_1",
        caption: "Giveaway Reel",
        mediaType: "VIDEO",
        mediaProductType: "REELS",
        permalink: "https://www.instagram.com/reel/media_1/",
        timestamp: "2026-08-20T08:00:00.000Z",
      },
    ]);
  });

  describe("classic builder target, saving and editing", () => {
    const dmKeyword: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["menu"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Here's the menu" }],
    };
    const twoAccounts = {
      data: [
        { id: "conn_old", igUserId: "1111", username: "expired.acct", status: "EXPIRED", connectedAt: "2026-08-01T00:00:00.000Z" },
        { id: "conn_live", igUserId: "2222", username: "live.acct", status: "CONNECTED", connectedAt: "2026-08-02T00:00:00.000Z" },
      ],
    };

    afterEach(() => {
      window.history.replaceState(null, "", "/");
    });

    it("pins a new classic automation to the first CONNECTED account instead of sending null", async () => {
      const fetchMock = stubFetch({ connection: twoAccounts });
      render(<AutomationBuilder variant="classic" initialDefinition={dmKeyword} initialName="Menu" />);

      const accountSelect = await screen.findByLabelText("Instagram account") as HTMLSelectElement;
      await waitFor(() => expect(accountSelect.value).toBe("2222"));
      // No "All connected accounts" escape hatch - the API always required a pin.
      expect(Array.from(accountSelect.options).map((option) => option.value)).toEqual(["1111", "2222"]);
      expect(screen.queryByText(/all connected accounts/i)).toBeNull();

      for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
      fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

      await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/automations")).toBe(true));
      const body = JSON.parse(String(findRequest(fetchMock, (url) => url === "/api/automations").body));
      expect(body).toMatchObject({ provider: "INSTAGRAM", instagramAccountId: "2222", facebookPageId: null });
    });

    it("always says which account a single-account workspace runs on", async () => {
      stubFetch();
      render(<AutomationBuilder variant="classic" />);
      expect((await screen.findByTestId("instagram-account-used")).textContent).toContain("@default.brand");
    });

    it("stops on the first step with a Settings link when no Instagram account is connected", async () => {
      stubFetch({ connection: { data: [] } });
      render(<AutomationBuilder variant="classic" initialName="Menu" />);

      const link = await screen.findByRole("link", { name: /connect an instagram account/i });
      expect(link.getAttribute("href")).toBe("/settings");
      fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
      expect((await screen.findByRole("alert")).textContent).toMatch(/connect an instagram account/i);
    });

    it("PATCHes the created automation on every save after the first instead of POSTing duplicates", async () => {
      window.history.replaceState(null, "", "/automations/new?type=classic");
      const fetchMock = stubFetch({ createResponse: { data: { id: "automation_created" } } });
      render(<AutomationBuilder variant="classic" initialDefinition={dmKeyword} initialName="Menu" />);

      for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
      fireEvent.click(screen.getByRole("button", { name: /save draft/i }));
      await screen.findByText(/saved to your workspace/i);
      expect(window.location.pathname).toBe("/automations/automation_created/edit");

      fireEvent.click(screen.getByRole("button", { name: /save and turn on/i }));
      await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")).toBe(true));

      const writes = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST" || (init as RequestInit | undefined)?.method === "PATCH");
      expect(writes.map(([url, init]) => [String(url), (init as RequestInit).method])).toEqual([
        ["/api/automations", "POST"],
        ["/api/automations/automation_created", "PATCH"],
      ]);
      expect(screen.getByRole("heading", { name: /edit automatic reply/i })).toBeTruthy();
    });

    it.each([
      ["DM keyword", dmKeyword],
      ["Story reply", { ...dmKeyword, trigger: { type: "story_reply", match: "any", keywords: [] } } as FlowDefinitionV1],
    ])("lets a %s automation send any DM action type, including on added messages", async (_label, definition) => {
      const fetchMock = stubFetch();
      render(<AutomationBuilder initialDefinition={definition} initialName="Rich reply" />);

      const actionStep = definition.trigger.type === "message" || definition.trigger.type === "story_reply" ? 2 : 1;
      for (let i = 0; i < actionStep; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

      const first = within(screen.getByRole("group", { name: "Message 1" })).getByLabelText("What to send") as HTMLSelectElement;
      expect(Array.from(first.options).map((option) => option.value)).toEqual(
        ["send_text", "send_image", "send_link", "send_button", "quick_replies"],
      );
      fireEvent.click(screen.getByRole("button", { name: /add another message/i }));
      const second = within(screen.getByRole("group", { name: "Message 2" }));
      fireEvent.change(second.getByLabelText("What to send"), { target: { value: "send_link" } });
      fireEvent.change(second.getByLabelText("Message text"), { target: { value: "Grab it here" } });
      fireEvent.change(second.getByLabelText("Link"), { target: { value: "https://acme.test/menu" } });

      for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
      fireEvent.click(screen.getByRole("button", { name: /save draft/i }));
      await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/automations")).toBe(true));
      const body = JSON.parse(String(findRequest(fetchMock, (url) => url === "/api/automations").body));
      expect(body.definition.actions[1]).toEqual({ type: "send_link", text: "Grab it here", url: "https://acme.test/menu" });
    });

    it("blocks the first step with a Settings link when the Facebook channel has no connected Page", async () => {
      stubFetch({
        facebookPages: { data: [
          { id: "fb_old", pageId: "999", pageName: "Old Page", status: "DISCONNECTED", connectedAt: "2026-08-01T00:00:00.000Z" },
        ] },
      });
      render(<AutomationBuilder variant="classic" initialName="Page replies" />);

      fireEvent.click(screen.getByRole("radio", { name: /facebook page/i }));
      const link = await screen.findByRole("link", { name: /connect a facebook page/i });
      expect(link.getAttribute("href")).toBe("/settings");
      // A disconnected Page is not offered.
      expect(screen.queryByLabelText("Facebook Page")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
      expect((await screen.findByRole("alert")).textContent).toMatch(/connect a facebook page/i);
      expect(screen.getByRole("button", { name: /step 1: when it runs/i }).getAttribute("aria-current")).toBe("step");
    });

    it("lists only connected Pages in the builder Page picker", async () => {
      stubFetch({
        facebookPages: { data: [
          { id: "fb_live", pageId: "12345", pageName: "Acme Co", status: "CONNECTED", connectedAt: "2026-08-29T10:00:00.000Z" },
          { id: "fb_old", pageId: "999", pageName: "Old Page", status: "EXPIRED", connectedAt: "2026-08-01T00:00:00.000Z" },
        ] },
      });
      render(<AutomationBuilder variant="classic" />);

      fireEvent.click(screen.getByRole("radio", { name: /facebook page/i }));
      const select = await screen.findByLabelText("Facebook Page") as HTMLSelectElement;
      expect(Array.from(select.options).map((option) => option.textContent)).toEqual(["Select a connected Page", "Acme Co"]);
    });

    it("picks comment-trigger posts with the media picker instead of pasted IDs", async () => {
      const fetchMock = stubFetch({ media: { data: [reel], paging: {} } });
      render(<AutomationBuilder variant="classic" initialName="Guide" />);

      expect(screen.queryByLabelText("Post IDs")).toBeNull();
      fireEvent.click(screen.getByRole("radio", { name: /only posts i choose/i }));
      fireEvent.click(await screen.findByRole("checkbox", { name: /giveaway reel/i }));

      for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
      fireEvent.click(screen.getByRole("button", { name: /save draft/i }));
      await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/automations")).toBe(true));
      const body = JSON.parse(String(findRequest(fetchMock, (url) => url === "/api/automations").body));
      expect(body.definition.trigger.mediaIds).toEqual(["media_1"]);
    });

    it("points captured emails at Contacts and formats the schedule in review", async () => {
      stubFetch();
      render(<AutomationBuilder initialDefinition={dmKeyword} initialName="Menu" />);
      for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
      fireEvent.click(screen.getByLabelText(/ask for the person.s email/i));
      expect(screen.getByText(/saved to Contacts/i)).toBeTruthy();
      expect(screen.queryByText(/My Automations page/i)).toBeNull();

      fireEvent.change(screen.getByLabelText("Question asking for their email"), { target: { value: "Email?" } });
      fireEvent.change(screen.getByLabelText("Thank-you message"), { target: { value: "Thanks" } });
      fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
      fireEvent.change(screen.getByLabelText("Run from"), { target: { value: "2026-10-10T14:30" } });
      fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

      const summary = screen.getByTestId("review-summary");
      expect(summary.textContent).toContain("from 10 Oct 2026");
      expect(summary.textContent).not.toContain("2026-10-10T14:30");
    });
  });

  describe("unsaved changes guard", () => {
    function addLink(href: string) {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = "Back to automations";
      document.body.appendChild(link);
      return link;
    }

    /** Clicks the link and reports whether the guard (a document capture
     * listener) cancelled it, then stops jsdom from attempting navigation. */
    function clickLink(link: HTMLAnchorElement): boolean {
      // The guard also stops propagation, so the target listener only runs
      // (and only needs to cancel jsdom's navigation) when the click got through.
      let reachedLink = false;
      const record = (event: Event) => {
        reachedLink = true;
        event.preventDefault();
      };
      link.addEventListener("click", record);
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      link.dispatchEvent(event);
      link.removeEventListener("click", record);
      return !reachedLink && event.defaultPrevented;
    }

    it("does nothing while the builder is untouched", () => {
      stubFetch();
      const confirm = vi.spyOn(window, "confirm");
      render(<AutomationBuilder variant="classic" />);
      const link = addLink("/automations");

      expect(clickLink(link)).toBe(false);
      expect(confirm).not.toHaveBeenCalled();
      link.remove();
    });

    it("confirms before an in-app link discards edits and blocks the navigation when declined", () => {
      stubFetch();
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      render(<AutomationBuilder variant="classic" />);
      fireEvent.change(screen.getByLabelText(/automation name/i), { target: { value: "Edited" } });
      const link = addLink("/automations");

      expect(clickLink(link)).toBe(true);
      expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/unsaved changes/i));

      const beforeUnload = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(beforeUnload);
      expect(beforeUnload.defaultPrevented).toBe(true);
      link.remove();
    });

    it("stops guarding once the edits are saved", async () => {
      stubFetch();
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      render(<AutomationBuilder initialDefinition={{
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["menu"] },
        conditions: [],
        actions: [{ type: "send_text", text: "Hi" }],
      }} />);
      fireEvent.change(screen.getByLabelText(/automation name/i), { target: { value: "Menu" } });
      for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
      fireEvent.click(screen.getByRole("button", { name: /save draft/i }));
      await screen.findByText(/saved to your workspace/i);

      const link = addLink("/automations");
      expect(clickLink(link)).toBe(false);
      expect(confirm).not.toHaveBeenCalled();
      link.remove();
    });
  });

  it("does not expose the removed Test run tool in either builder", () => {
    stubFetch();
    const view = render(<AutomationBuilder />);
    expect(screen.queryByRole("region", { name: "Test run" })).toBeNull();

    view.unmount();
    render(<AutomationBuilder variant="classic" />);
    expect(screen.queryByRole("region", { name: "Test run" })).toBeNull();
  });
});
