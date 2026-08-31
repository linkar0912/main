// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationBuilder } from "./automation-builder";
import type { FlowDefinitionV1, FlowDefinitionV2 } from "@/src/lib/automation/types";

type FetchOverrides = {
  media?: unknown;
  createResponse?: unknown;
  patchResponse?: unknown;
  connection?: unknown;
  facebookPages?: unknown;
};

function stubFetch(overrides: FetchOverrides = {}) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/meta/media")) {
      return { ok: true, json: async () => overrides.media ?? { data: [], paging: {} } } as Response;
    }
    if (url.endsWith("/api/meta/connection") || url.includes("/api/meta/connection?")) {
      return { ok: true, json: async () => overrides.connection ?? { data: [] } } as Response;
    }
    if (url.endsWith("/api/facebook/connection") || url.includes("/api/facebook/connection?")) {
      return { ok: true, json: async () => overrides.facebookPages ?? { data: [] } } as Response;
    }
    if (!init?.method || init.method === "POST") {
      return { ok: true, json: async () => overrides.createResponse ?? { data: { id: "automation_new" } } } as Response;
    }
    if (init.method === "PATCH") {
      return { ok: true, json: async () => overrides.patchResponse ?? { data: { id: "automation_new" } } } as Response;
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
  fireEvent.change(screen.getByLabelText(/^keywords$/i), { target: { value: "drop" } });
  fireEvent.change(screen.getByLabelText(/public reply variation 1/i), { target: { value: "Check your messages." } });
  fireEvent.change(screen.getByLabelText(/opening message text/i), { target: { value: "Follow to unlock the link!" } });
  fireEvent.change(screen.getByLabelText(/not-following prompt/i), { target: { value: "Please follow first." } });
  fireEvent.change(screen.getByLabelText(/delivery message/i), { target: { value: "Here is your link." } });
  fireEvent.change(screen.getByLabelText(/delivery link/i), { target: { value: "https://example.com/prize" } });
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

    const preview = screen.getByLabelText(/test preview/i);
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

    const preview = screen.getByLabelText(/test preview/i);
    expect(preview.querySelector(".ig-device")).toBeTruthy();
    expect(preview.querySelector(".ig-statusbar-island")).toBeTruthy();
    expect(preview.querySelectorAll(".ig-device-button")).toHaveLength(3);
    expect(preview.querySelector(".ig-homebar")).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

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

    expect(screen.getByLabelText(/step 2 message/i)).toBeTruthy();
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

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
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
    expect(screen.getByRole("button", { name: /save/i })).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: /add a follow-up nudge/i }));
    fireEvent.change(screen.getByLabelText(/nudge 1 message/i), { target: { value: "Still there?" } });
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

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

    const pageSelect = await screen.findByLabelText(/Facebook Page/i);
    expect(pageSelect).toBeTruthy();
    fireEvent.change(pageSelect, { target: { value: "12345" } });

    // Preview should now be the Facebook layout, not the Instagram phone shell.
    const preview = screen.getAllByLabelText(/test preview/i)[0] as HTMLElement;
    expect(preview.querySelector(".facebook-preview")).toBeTruthy();
    expect(screen.getByText("Public Page reply")).toBeTruthy();
    expect(preview.querySelector(".ig-device")).toBeNull();

    // Walk through the wizard and save; the request should carry the
    // facebookPageId and explicitly null the instagramAccountId so the API
    // does not see dual pins.
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save automation/i }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST").length).toBe(1));
    const createRequest = findRequest(fetchMock, (url) => url === "/api/automations");
    const body = JSON.parse(String(createRequest.body)) as { provider?: string; facebookPageId?: string; instagramAccountId?: string | null };
    expect(body.provider).toBe("FACEBOOK");
    expect(body.facebookPageId).toBe("12345");
    expect(body.instagramAccountId).toBeNull();
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
    fireEvent.change(screen.getByLabelText("Keyword logic"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Exclude keywords"), { target: { value: "scam, spam" } });
    fireEvent.click(screen.getByLabelText("Reply once per person"));
    fireEvent.click(screen.getByRole("button", { name: "Add reply variation" }));
    fireEvent.change(screen.getByLabelText("Public Page reply variation 2"), { target: { value: "Happy to help." } });
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("Daily send limit"), { target: { value: "250" } });

    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save automation/i }));

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

    const channel = await screen.findByLabelText("Channel") as HTMLSelectElement;
    expect(channel.value).toBe("FACEBOOK");
    fireEvent.change(channel, { target: { value: "INSTAGRAM" } });

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/selected Facebook Page/i));
    expect(channel.value).toBe("FACEBOOK");
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

    expect(screen.getByLabelText("Lead webhook URL")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add question" })).toBeTruthy();
    expect(screen.queryByLabelText("Delivery email subject")).toBeNull();
  });

  it("defaults new automations to the version 2 campaign builder with sections in order", () => {
    stubFetch();
    render(<AutomationBuilder />);

    expect(screen.queryByText("Flow v2")).toBeNull();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent ?? "");
    const indexOf = (needle: RegExp) => headings.findIndex((text) => needle.test(text));
    const order = ["watch", "comment", "public reply", "opening", "follow", "deliver", "limits", "review"].map(
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
    fireEvent.change(screen.getByLabelText(/trigger source/i), { target: { value: "all_media" } });
    fireEvent.change(screen.getByLabelText(/^keywords$/i), { target: { value: "guide" } });

    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.change(screen.getByLabelText(/public reply variation 1/i), { target: { value: "I’ll send it now." } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.change(screen.getByLabelText(/opening message text/i), { target: { value: "Tap below to continue." } });
    fireEvent.change(screen.getByLabelText(/not-following prompt/i), { target: { value: "Follow first, then try again." } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.change(screen.getByLabelText(/delivery message/i), { target: { value: "Here is your link." } });
    fireEvent.change(screen.getByLabelText(/delivery link/i), { target: { value: "https://example.com/guide" } });

    for (let i = 0; i < 2; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    }

    expect(screen.queryByRole("button", { name: /^next$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /save draft/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /save & activate/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByRole("button", { name: /^next$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /save draft/i })).toBeNull();
  });

  it("keeps later campaign stages locked until the current stage is complete", () => {
    stubFetch();
    render(<AutomationBuilder />);

    const secondStage = screen.getByRole("button", { name: /comment & reply/i });
    const reviewStage = screen.getByRole("button", { name: /review/i });
    expect(secondStage).toHaveProperty("disabled", true);
    expect(reviewStage).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("alert").textContent).toBe("Give this automation a name first.");
    expect(screen.getByRole("heading", { name: /which posts should linkar watch/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/automation name/i), { target: { value: "Unlocked campaign" } });
    fireEvent.change(screen.getByLabelText(/trigger source/i), { target: { value: "all_media" } });
    fireEvent.change(screen.getByLabelText(/^keywords$/i), { target: { value: "guide" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    expect(secondStage).toHaveProperty("disabled", false);
    expect(screen.getByRole("heading", { name: /what public reply should linkar post/i })).toBeTruthy();
    expect(reviewStage).toHaveProperty("disabled", true);
  });

  it("keeps later classic stages locked until the trigger stage is complete", () => {
    stubFetch();
    const legacyDefinition: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Thanks!" }],
    };
    render(<AutomationBuilder initialDefinition={legacyDefinition} initialName="Classic flow" />);

    const conditionStage = screen.getByRole("button", { name: /condition/i });
    const reviewStage = screen.getByRole("button", { name: /review/i });
    expect(conditionStage).toHaveProperty("disabled", true);
    expect(reviewStage).toHaveProperty("disabled", true);

    fireEvent.click(conditionStage);
    expect(screen.getByRole("heading", { name: /when should linkar listen/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(conditionStage).toHaveProperty("disabled", false);
    expect(screen.getByRole("heading", { name: /keep the audience precise/i })).toBeTruthy();
    expect(reviewStage).toHaveProperty("disabled", true);
  });

  it("only shows the media picker for the specific-media source and clears selections when switching away", async () => {
    stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");

    fireEvent.change(screen.getByLabelText(/trigger source/i), { target: { value: "all_media" } });
    expect(screen.queryByRole("checkbox")).toBeNull();

    fireEvent.change(screen.getByLabelText(/trigger source/i), { target: { value: "specific_media" } });
    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("false");
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
    expect(screen.getByRole("button", { name: /comment & reply/i })).toHaveProperty("disabled", true);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/automations", expect.anything());
  });

  it("switches between keyword and any-comment match modes, clearing keywords for any", async () => {
    const fetchMock = stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    fireEvent.change(screen.getByLabelText(/match mode/i), { target: { value: "any" } });
    expect(screen.queryByLabelText(/^keywords$/i)).toBeNull();

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

    const addButton = screen.getByRole("button", { name: /add variation/i });
    for (let i = 0; i < 4; i += 1) fireEvent.click(addButton);

    expect(screen.getAllByLabelText(/public reply variation/i)).toHaveLength(5);
    expect(screen.getByRole("button", { name: /add variation/i })).toHaveProperty("disabled", true);
  });

  it("groups variation controls with their supporting copy", () => {
    stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    const helper = screen.getByText(/rotates between variations/i);
    expect(helper.closest(".field-support")).toBeTruthy();
    expect(helper.closest(".field-support")?.querySelector("button")?.textContent).toMatch(/add variation/i);
  });

  it("captures opening consent copy and the opt-in button label without a final URL leaking into the definition text", async () => {
    const fetchMock = stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    fireEvent.change(screen.getByLabelText(/opening message text/i), { target: { value: "Follow us to get the freebie." } });
    fireEvent.change(screen.getByLabelText(/opt-in button label/i), { target: { value: "Send it" } });

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
    fireEvent.change(screen.getByLabelText(/not-following prompt/i), { target: { value: "Follow first, then tap below." } });
    fireEvent.change(screen.getByLabelText(/recheck button label/i), { target: { value: "I followed" } });

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
    fireEvent.change(screen.getByLabelText(/delivery button label/i), { target: { value: "Open link" } });

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
    fireEvent.change(screen.getByLabelText(/delivery link/i), { target: { value: "http://example.com/prize" } });
    goToReviewStep();

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Delivery links must use HTTPS.");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/automations", expect.anything());

    fireEvent.change(screen.getByLabelText(/delivery link/i), { target: { value: "http://localhost:3000/prize" } });
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

    fireEvent.change(screen.getByLabelText(/delivery link/i), {
      target: { value: "https://example.com/prizehttps://example.com/prize" },
    });
    expect(await screen.findByText(/two links pasted together/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/delivery link/i), { target: { value: "https://example.com/prize" } });
    await waitFor(() => expect(screen.queryByText(/two links pasted together/i)).toBeNull());
  });

  it("shows the Instagram DM preview reflecting entered campaign copy, without leaking it before the DM view is selected", async () => {
    const fetchMock = stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    const callsBeforePreview = fetchMock.mock.calls.length;

    const preview = screen.getByLabelText(/test preview/i);
    expect(preview.textContent).not.toContain("Follow to unlock the link!");

    fireEvent.click(within(preview).getByRole("tab", { name: "DM" }));
    expect(preview.textContent).toContain("Follow to unlock the link!");
    expect(preview.textContent).toContain("Please follow first.");
    expect(preview.textContent).toContain("Here is your link.");

    expect(fetchMock.mock.calls.length).toBe(callsBeforePreview);
    expect(preview.textContent?.toLowerCase()).not.toContain("not sent to instagram");
    expect(preview.textContent).toContain("Instagram");
    expect(preview.textContent).toContain("Updated");
  });

  it("shows the connected account's handle, ID, and reel media in the phone preview", async () => {
    const fetchMock = stubFetch({
      connection: { data: [{ id: "conn_1", igUserId: "17841400000000001", username: "brand.acct", status: "CONNECTED", connectedAt: "2026-08-20T00:00:00.000Z" }] },
      media: { data: [reel], paging: {} },
    });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));

    const preview = screen.getByLabelText(/test preview/i);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/meta/connection"))).toBe(true));
    await waitFor(() => expect(preview.textContent).toContain("@brand.acct"));
    expect(preview.textContent).toContain("ID 17841400000000001");
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

  it("saves and activates by saving first, then patching the returned automation to ACTIVE", async () => {
    const fetchMock = stubFetch({
      media: { data: [reel], paging: {} },
      createResponse: { data: { id: "automation_9" } },
      patchResponse: { data: { id: "automation_9", status: "ACTIVE" } },
    });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    goToReviewStep();
    fireEvent.click(screen.getByRole("button", { name: /save & activate/i }));

    await waitFor(() => {
      const activatePatch = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/automations/automation_9" && (init as RequestInit)?.method === "PATCH",
      );
      expect(activatePatch).toBeTruthy();
    });
    const activateRequest = findRequest(
      fetchMock,
      (url, init) => url === "/api/automations/automation_9" && init?.method === "PATCH",
    );
    expect(JSON.parse(String(activateRequest.body))).toEqual({ status: "ACTIVE" });
    const createRequest = findRequest(fetchMock, (url) => url === "/api/automations");
    expect(createRequest.method).toBe("POST");
  });

  it("submits the full version 2 JSON shape expected by the API", async () => {
    const fetchMock = stubFetch({ media: { data: [reel], paging: {} } });
    render(<AutomationBuilder />);

    await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox"));
    await fillRequiredCampaignFields();
    fireEvent.change(screen.getByLabelText(/opt-in button label/i), { target: { value: "Send it" } });
    fireEvent.change(screen.getByLabelText(/recheck button label/i), { target: { value: "I followed" } });
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
    fireEvent.change(screen.getByLabelText(/^keywords$/i), { target: { value: "Guide, guide, GUIDE , help" } });
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

    fireEvent.change(screen.getByLabelText(/trigger source/i), { target: { value: "next_media" } });
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
});
