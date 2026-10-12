// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const { SettingsScreen } = await import("./settings-screen");

type Route = { data?: unknown; mode?: string; members?: unknown[]; invitations?: unknown[] };

function stubFetch(routes: Record<string, Route>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const match = Object.entries(routes).find(([path]) => url.endsWith(path) || url.includes(path + "?"));
      if (!match) {
        // Find the longest path the URL contains as a prefix, to disambiguate
        // `/api/facebook/connection` from `/api/facebook/connection/health`.
        const prefixMatch = Object.entries(routes)
          .filter(([path]) => url.startsWith(path) || url.includes(path + "/") || url.includes(path + "?"))
          .sort(([a], [b]) => b.length - a.length)[0];
        if (!prefixMatch) throw new Error(`Unexpected fetch to ${url}`);
        return { ok: true, json: async () => prefixMatch[1] } as unknown as Response;
      }
      return { ok: true, json: async () => match[1] } as unknown as Response;
    }),
  );
}

describe("SettingsScreen webhook health panel", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/settings");
  });

  it("shows all-caught-up when every required field is subscribed", async () => {
    stubFetch({
      "/api/meta/connection/health": {
        data: [{
          id: "connection_1",
          username: "creator",
          status: "CONNECTED",
          requiredFields: ["comments", "messages", "messaging_postbacks", "messaging_optins", "messaging_referral"],
          subscribedFields: ["comments", "messages", "messaging_postbacks", "messaging_optins", "messaging_referral"],
          missingFields: [],
        }],
      },
      "/api/meta/connection": { data: [{ id: "connection_1", igUserId: "ig_1", username: "creator", status: "CONNECTED", connectedAt: "2026-08-21T00:00:00.000Z" }] },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/workspace/bootstrap": { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } },
    });

    await act(async () => { render(<SettingsScreen />); });

    expect(await screen.findByText("All caught up")).toBeTruthy();
    expect(screen.queryByText(/Reconnect Instagram/)).toBeNull();
  });

  it("loads team and delivery settings only when those sections are opened", async () => {
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": { data: [] },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/workspace/bootstrap": { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } },
      "/api/team/invitations": { members: [], invitations: [] },
      "/api/workspace/messaging": { data: null },
    });

    await act(async () => { render(<SettingsScreen />); });
    await screen.findByText("No account connected");
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/team/invitations"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/workspace/messaging"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Team/ }));
    await screen.findByLabelText("Email address");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/team/invitations"))).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Delivery/ }));
    await screen.findByRole("region", { name: "Messaging hours" });
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/workspace/messaging"))).toHaveLength(1));
  });

  it("shows connection names before slower provider health checks finish", async () => {
    let finishHealth: ((response: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/health")) return new Promise<Response>((resolve) => { finishHealth = resolve; });
      if (url.includes("/api/meta/connection")) return { ok: true, json: async () => ({ data: [{ id: "connection_1", igUserId: "ig_1", username: "creator", status: "CONNECTED", connectedAt: "2026-08-21T00:00:00.000Z" }] }) } as Response;
      if (url.includes("/api/facebook/connection")) return { ok: true, json: async () => ({ data: [] }) } as Response;
      if (url.includes("/api/workspace/bootstrap")) return { ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } }) } as Response;
      throw new Error(`Unexpected fetch to ${url}`);
    }));

    await act(async () => { render(<SettingsScreen />); });
    expect(await screen.findByText("@creator")).toBeTruthy();
    expect(screen.queryByText("All caught up")).toBeNull();

    await act(async () => finishHealth?.({ ok: true, json: async () => ({ data: [] }) } as Response));
  });

  it("lists missing fields and prompts a reconnect when the subscription is incomplete", async () => {
    stubFetch({
      "/api/meta/connection/health": {
        data: [{
          id: "connection_1",
          username: "creator",
          status: "CONNECTED",
          requiredFields: ["comments", "messages", "messaging_postbacks", "messaging_optins", "messaging_referral"],
          subscribedFields: ["comments", "messages"],
          missingFields: ["messaging_postbacks", "messaging_optins", "messaging_referral"],
        }],
      },
      "/api/meta/connection": { data: [{ id: "connection_1", igUserId: "ig_1", username: "creator", status: "CONNECTED", connectedAt: "2026-08-21T00:00:00.000Z" }] },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/workspace/bootstrap": { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } },
    });

    await act(async () => { render(<SettingsScreen />); });

    expect(await screen.findByText("Some fields need a reconnect")).toBeTruthy();
    expect(screen.getByText(/Reconnect Instagram/)).toBeTruthy();
    expect(screen.getByText("Quick-reply taps")).toBeTruthy();
  });

  it("does not render the panel when no Instagram account is connected", async () => {
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": { data: [] },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/workspace/bootstrap": { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "demo" } },
    });

    await act(async () => { render(<SettingsScreen />); });

    await screen.findByText("No account connected");
    expect(screen.queryByLabelText("Connection check")).toBeNull();
  });

  it("organizes delivery controls before the supporting safeguards", async () => {
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": { data: [] },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/workspace/bootstrap": { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } },
      "/api/workspace/messaging": { data: null },
    });

    await act(async () => { render(<SettingsScreen />); });
    fireEvent.click(screen.getByRole("button", { name: /Delivery/ }));

    expect(screen.getByRole("region", { name: "Messaging hours" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Delivery safeguards" })).toBeTruthy();
    expect(screen.getByText("Quiet hours disabled")).toBeTruthy();
    expect(screen.getByLabelText("Start time")).toBeTruthy();
    expect(screen.getByLabelText("End time")).toBeTruthy();
    expect(screen.getByLabelText("Workspace timezone")).toBeTruthy();
  });

  it("mounts workspace billing as its own settings section", async () => {
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": { data: [] },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/workspace/bootstrap": { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } },
      "/api/billing": { data: { catalog: [], canManage: true, billingConfigured: true, entitlementPlanKey: "free", deliveriesUsed: 0, subscription: null } },
    });

    await act(async () => { render(<SettingsScreen />); });
    fireEvent.click(screen.getByRole("button", { name: /Billing/ }));

    expect(await screen.findByRole("heading", { name: "Plan and usage" })).toBeTruthy();
  });

  it("keeps every support and policy destination in Policies", async () => {
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": { data: [] },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/workspace/bootstrap": { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } },
    });

    await act(async () => { render(<SettingsScreen />); });
    fireEvent.click(screen.getByRole("button", { name: /Policies/ }));

    const directory = screen.getByRole("region", { name: "Policies and support" });
    for (const [name, href] of [
      ["Support", "/support"],
      ["Terms of service", "/terms"],
      ["Privacy policy", "/privacy"],
      ["Cookies", "/cookies"],
      ["Acceptable use", "/acceptable-use"],
      ["Data processing", "/data-processing"],
      ["Service providers", "/service-providers"],
      ["Data deletion", "/data-deletion"],
    ]) {
      expect(within(directory).getByRole("link", { name: new RegExp(`^${name}`) }).getAttribute("href")).toBe(href);
    }
  });

  it("explains when the Instagram account belongs to another workspace", async () => {
    window.history.replaceState({}, "", "/settings?meta=already-connected");
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": { data: [] },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/workspace/bootstrap": { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } },
    });

    await act(async () => { render(<SettingsScreen />); });

    expect(await screen.findByText(/already belongs to another Linkar workspace/)).toBeTruthy();
  });

  it("renders a Facebook Page card and a connect button when no Pages are linked", async () => {
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": { data: [] },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/workspace/bootstrap": { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } },
    });

    await act(async () => { render(<SettingsScreen />); });

    expect(await screen.findByText("No Page connected")).toBeTruthy();
    const connectLink = screen.getByRole("link", { name: /Connect a Facebook Page/ });
    expect(connectLink.getAttribute("href")).toBe("/api/facebook/oauth/start");
    // The empty state guides with the primary action, not a "connect another".
    expect(connectLink.classList.contains("button-primary")).toBe(true);
    expect(screen.queryByRole("link", { name: /Connect another/ })).toBeNull();

    const instagramCard = screen.getByRole("region", { name: "Instagram" });
    const facebookCard = screen.getByRole("region", { name: "Facebook Pages" });
    expect(instagramCard.getAttribute("data-channel-card")).toBe("instagram");
    expect(facebookCard.getAttribute("data-channel-card")).toBe("facebook");
    expect(within(instagramCard).getByText("No account connected")).toBeTruthy();
    // Nothing to troubleshoot until something is connected.
    expect(screen.queryByRole("region", { name: "Troubleshooting" })).toBeNull();
    expect(instagramCard.querySelector('[data-brand-logo="instagram"]')).toBeTruthy();
    expect(facebookCard.querySelector('[data-brand-logo="facebook"]')).toBeTruthy();
    expect(instagramCard.querySelector('[data-channel-health="instagram"]')).toBeNull();
    expect(facebookCard.querySelector('[data-channel-health="facebook"]')).toBeNull();
  });

  it("summarizes the workspace and keeps each webhook status with its channel", async () => {
    stubFetch({
      "/api/meta/connection/health": {
        data: [{
          id: "connection_1",
          username: "creator",
          status: "CONNECTED",
          requiredFields: ["comments", "messages"],
          subscribedFields: ["comments", "messages"],
          missingFields: [],
        }],
      },
      "/api/meta/connection": {
        data: [{ id: "connection_1", igUserId: "ig_1", username: "creator", status: "CONNECTED", connectedAt: "2026-08-21T00:00:00.000Z" }],
      },
      "/api/facebook/connection": {
        data: [{ id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED", connectedAt: "2026-08-29T10:00:00.000Z" }],
      },
      "/api/facebook/connection/health": {
        data: [{
          id: "fb_rec_1",
          pageId: "12345",
          pageName: "Acme Co",
          status: "CONNECTED",
          requiredFields: ["feed"],
          subscribedFields: ["feed"],
          missingFields: [],
        }],
      },
      "/api/workspace/bootstrap": { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } },
    });

    await act(async () => { render(<SettingsScreen />); });

    const summary = await screen.findByRole("region", { name: "Workspace status" });
    await vi.waitFor(() => expect(summary.textContent).toContain("2 channels connected"));
    expect(summary.textContent).toContain("Live");
    expect(within(summary).getByRole("group", { name: "Mode status" })).toBeTruthy();
    expect(within(summary).getByRole("group", { name: "Channel status" })).toBeTruthy();
    expect(within(summary).getByRole("group", { name: "Incoming messages status" }).textContent).toContain("Incoming messages healthy");
    expect(screen.getByRole("button", { name: /Connections/ }).getAttribute("aria-pressed")).toBe("true");

    const instagramCard = screen.getByRole("region", { name: "Instagram" });
    const facebookCard = screen.getByRole("region", { name: "Facebook Pages" });
    expect(instagramCard.querySelector('[data-channel-health="instagram"]')).toBeTruthy();
    expect(facebookCard.querySelector('[data-channel-health="facebook"]')).toBeTruthy();
    // One status word per account, quiet when fine.
    expect(within(instagramCard).getByText("Connected").className).toContain("is-success");
    expect(screen.getByRole("region", { name: "Troubleshooting" })).toBeTruthy();
  });

  it("groups both channel managers into one accessible connections console", async () => {
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": {
        data: [{ id: "connection_1", igUserId: "ig_1", username: "creator", status: "CONNECTED", connectedAt: "2026-08-21T00:00:00.000Z" }],
      },
      "/api/facebook/connection": {
        data: [{ id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED", connectedAt: "2026-08-29T10:00:00.000Z" }],
      },
      "/api/facebook/connection/health": { data: [] },
      "/api/workspace/bootstrap": { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } },
    });

    await act(async () => { render(<SettingsScreen />); });

    const consoleRegion = await screen.findByRole("region", { name: "Connections" });
    await within(consoleRegion).findByText("@creator");
    expect(consoleRegion.querySelectorAll("[data-channel-card]")).toHaveLength(2);
    expect(within(consoleRegion).getByRole("region", { name: "Instagram" })).toBeTruthy();
    expect(within(consoleRegion).getByRole("region", { name: "Facebook Pages" })).toBeTruthy();
    expect(within(consoleRegion).getByRole("link", { name: /Connect another account/ }).getAttribute("href")).toBe("/api/meta/oauth/start");
    expect(within(consoleRegion).getByRole("link", { name: /Connect another Page/ }).getAttribute("href")).toBe("/api/facebook/oauth/start");
    expect(consoleRegion.querySelector('[data-channel-card="instagram"]')).toBeTruthy();
    expect(consoleRegion.querySelector('[data-channel-card="facebook"]')).toBeTruthy();
    expect(consoleRegion.querySelector('a[href="/api/meta/oauth/start"]')).toBeTruthy();
    expect(consoleRegion.querySelector('a[href="/api/facebook/oauth/start"]')).toBeTruthy();
  });

  it("shows the Pages returned by Facebook after OAuth instead of auto-connecting the first", async () => {
    window.history.replaceState({}, "", "/settings?facebook=select-page");
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": { data: [] },
      "/api/facebook/oauth/pages": { data: [
        { id: "page_1", name: "Acme Co" },
        { id: "page_2", name: "Acme Studio" },
      ] },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/workspace/bootstrap": { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } },
    });

    await act(async () => { render(<SettingsScreen />); });

    const picker = await screen.findByLabelText("Choose Facebook Page");
    expect(picker.textContent).toContain("Acme Co");
    expect(picker.textContent).toContain("Acme Studio");
    expect(screen.getByRole("button", { name: "Connect selected Page" })).toBeTruthy();
  });

  it("lists connected Pages and offers a disconnect button", async () => {
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": { data: [] },
      "/api/facebook/connection": {
        data: [
          { id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED", connectedAt: "2026-08-29T10:00:00.000Z", avatarUrl: "/api/facebook/avatar?pageId=12345&profileId=12345" },
        ],
      },
      "/api/facebook/connection/health": { data: [{
        id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED",
        requiredFields: ["feed"], subscribedFields: ["feed"], missingFields: [],
      }] },
      "/api/workspace/bootstrap": { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } },
    });

    await act(async () => { render(<SettingsScreen />); });

    expect(await screen.findByText("Acme Co")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Acme Co profile photo" }).getAttribute("src"))
      .toBe("/api/facebook/avatar?pageId=12345&profileId=12345");
    const disconnectButtons = screen.getAllByRole("button", { name: "Disconnect" });
    expect(disconnectButtons).toHaveLength(1);
  });

  it("shows a reconnect prompt when the Facebook health check reports missing fields", async () => {
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": { data: [] },
      "/api/facebook/connection": {
        data: [
          { id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED", connectedAt: "2026-08-29T10:00:00.000Z" },
        ],
      },
      "/api/facebook/connection/health": { data: [{
        id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED",
        requiredFields: ["feed"], subscribedFields: [], missingFields: ["feed"],
      }] },
      "/api/workspace/bootstrap": { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } },
    });

    await act(async () => { render(<SettingsScreen />); });

    expect(await screen.findByText("Some fields need a reconnect")).toBeTruthy();
    expect(screen.getByText(/Reconnect the Page/)).toBeTruthy();
  });

  it("shows a retry-able error instead of blanking the section when the initial load fails, and recovers on retry", async () => {
    let shouldFail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (shouldFail) throw new Error("network down");
        return { ok: true, json: async () => ({ data: [] }) } as unknown as Response;
      }),
    );

    await act(async () => { render(<SettingsScreen />); });

    expect(await screen.findByText(/Could not load your connections/)).toBeTruthy();
    // A failed load must not read as "nothing is connected".
    expect(screen.queryByText("No account connected")).toBeNull();
    expect(screen.queryByRole("region", { name: "Workspace pulse" })).toBeNull();

    shouldFail = false;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry" })); });

    expect(await screen.findByText("No account connected")).toBeTruthy();
    expect(screen.queryByText(/Could not load your connections/)).toBeNull();
  });

  it("distinguishes a team-fetch network failure from an actual permissions error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/team/invitations")) throw new Error("network down");
        if (url.includes("/api/workspace/bootstrap")) {
          return { ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } }) } as unknown as Response;
        }
        return { ok: true, json: async () => ({ data: [] }) } as unknown as Response;
      }),
    );

    await act(async () => { render(<SettingsScreen />); });
    fireEvent.click(screen.getByRole("button", { name: /Team/ }));

    expect(await screen.findByText(/Could not load team settings/)).toBeTruthy();
    // The permissions copy is reserved for an actual 403 from the API, not a
    // fetch that never got a response at all.
    expect(screen.queryByText("Only workspace owners and admins can manage the team.")).toBeNull();
  });

  it("shows webhook health separately for each connected Instagram account", async () => {
    stubFetch({
      "/api/meta/connection/health": {
        data: [
          { id: "connection_1", username: "creator_one", status: "CONNECTED", requiredFields: ["comments", "messages"], subscribedFields: ["comments", "messages"], missingFields: [] },
          { id: "connection_2", username: "creator_two", status: "CONNECTED", requiredFields: ["comments", "messages"], subscribedFields: ["comments"], missingFields: ["messages"] },
        ],
      },
      "/api/meta/connection": {
        data: [
          { id: "connection_1", igUserId: "ig_1", username: "creator_one", status: "CONNECTED", connectedAt: "2026-08-21T00:00:00.000Z" },
          { id: "connection_2", igUserId: "ig_2", username: "creator_two", status: "CONNECTED", connectedAt: "2026-08-21T00:00:00.000Z" },
        ],
      },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/workspace/bootstrap": { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } },
    });

    await act(async () => { render(<SettingsScreen />); });

    const first = await screen.findByLabelText("Connection check for @creator_one");
    const second = await screen.findByLabelText("Connection check for @creator_two");
    expect(first.textContent).toContain("All caught up");
    expect(second.textContent).toContain("Some fields need a reconnect");
    // Each status sits in its own account row, and only the account with a
    // problem asks for a reconnect.
    expect(first.closest("#account-connection_1")).toBeTruthy();
    expect(second.closest("#account-connection_2")).toBeTruthy();
    expect(within(screen.getByText("@creator_two").closest("li")!).getByText("Needs reconnect")).toBeTruthy();
    expect(within(screen.getByText("@creator_one").closest("li")!).queryByText("Needs reconnect")).toBeNull();
    // Problems open their field list; a healthy account keeps it folded away.
    expect(within(second).getByRole("button", { name: /Some fields need a reconnect/ }).getAttribute("aria-expanded")).toBe("true");
    const healthy = within(first).getByRole("button", { name: /All caught up/ });
    expect(healthy.getAttribute("aria-expanded")).toBe("false");
    expect(within(first).queryByText("Comments")).toBeNull();
    fireEvent.click(healthy);
    expect(within(first).getByText("Comments")).toBeTruthy();
  });
});

type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown } | undefined;

/** Answers the always-on connection requests, then defers to `handler`. */
function stubSettingsFetch(handler: Handler, options: { connections?: unknown[]; pages?: unknown[]; mode?: string } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const custom = handler(url, init);
    const reply = custom ?? (
      url.includes("/api/workspace/bootstrap") ? { body: { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: options.mode ?? "configured" } } }
        : url.includes("/health") ? { body: { data: [] } }
          : url.startsWith("/api/meta/connection") ? { body: { data: options.connections ?? [] } }
            : url.startsWith("/api/facebook/connection") ? { body: { data: options.pages ?? [] } }
              : undefined
    );
    if (!reply) throw new Error(`Unexpected fetch to ${url}`);
    const status = reply.status ?? 200;
    return { ok: status < 400, status, json: async () => reply.body } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const creator = { id: "connection_1", igUserId: "ig_1", username: "creator", status: "CONNECTED", connectedAt: "2026-08-21T00:00:00.000Z" };

describe("SettingsScreen confirmations and team feedback", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/settings");
  });

  it("asks before disconnecting, names the account, and refreshes the shell afterwards", async () => {
    const fetchMock = stubSettingsFetch((_url, init) => (init?.method === "DELETE" ? { body: { ok: true } } : undefined), { connections: [creator] });
    const changed = vi.fn();
    window.addEventListener("linkar-workspace-change", changed);
    try {
      await act(async () => { render(<SettingsScreen />); });
      fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));

      // One click only opens the confirmation; nothing is deleted yet.
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
      const confirm = screen.getByRole("group", { name: "Confirm disconnecting @creator" });
      expect(confirm.textContent).toMatch(/automation on this account stops/i);
      expect(document.activeElement?.textContent).toBe("Cancel");

      fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("group", { name: /Confirm disconnecting/ })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Disconnect @creator" })); });

      expect(fetchMock).toHaveBeenCalledWith("/api/meta/connection", expect.objectContaining({ method: "DELETE", body: JSON.stringify({ id: "connection_1" }) }));
      expect(await screen.findByText("No account connected")).toBeTruthy();
      expect(changed).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("linkar-workspace-change", changed);
    }
  });

  it("confirms a Facebook Page disconnect by name", async () => {
    const page = { id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED", connectedAt: "2026-08-29T10:00:00.000Z" };
    const fetchMock = stubSettingsFetch((_url, init) => (init?.method === "DELETE" ? { body: { ok: true } } : undefined), { pages: [page] });

    await act(async () => { render(<SettingsScreen />); });
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Disconnect Acme Co" })); });

    expect(fetchMock).toHaveBeenCalledWith("/api/facebook/connection", expect.objectContaining({ method: "DELETE" }));
    expect(await screen.findByText("No Page connected")).toBeTruthy();
  });

  it("reports a sent invitation even when the team list then fails to refresh", async () => {
    let teamLoads = 0;
    stubSettingsFetch((url, init) => {
      if (!url.startsWith("/api/team/invitations")) return undefined;
      if (init?.method === "POST") return { status: 201, body: { id: "inv_1", email: "new@example.com", role: "MEMBER" } };
      teamLoads += 1;
      return teamLoads === 1 ? { body: { members: [{ email: "owner@example.com", role: "OWNER" }], invitations: [] } } : { status: 500, body: {} };
    });

    await act(async () => { render(<SettingsScreen />); });
    fireEvent.click(screen.getByRole("button", { name: /Team/ }));
    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "new@example.com" } });
    await act(async () => { fireEvent.submit(screen.getByLabelText("Email address").closest("form")!); });

    expect(await screen.findByText("Invitation sent to new@example.com.")).toBeTruthy();
    expect(screen.getByText(/team list could not refresh/i)).toBeTruthy();
    expect(screen.queryByText("Could not send the invitation.")).toBeNull();
  });

  it("explains a full plan instead of a generic invitation failure", async () => {
    stubSettingsFetch((url, init) => {
      if (!url.startsWith("/api/team/invitations")) return undefined;
      if (init?.method === "POST") return { status: 409, body: { error: "limit_reached", capability: "members", used: 3, limit: 3 } };
      return { body: { members: [{ email: "owner@example.com", role: "OWNER" }], invitations: [] } };
    });

    await act(async () => { render(<SettingsScreen />); });
    fireEvent.click(screen.getByRole("button", { name: /Team/ }));
    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "new@example.com" } });
    await act(async () => { fireEvent.submit(screen.getByLabelText("Email address").closest("form")!); });

    expect(await screen.findByText(/Your plan includes 3 team seats/)).toBeTruthy();
  });

  it("revokes an invitation only after confirming, with a pending state", async () => {
    let finishRevoke: (() => void) | undefined;
    let revoked = false;
    const fetchMock = stubSettingsFetch((url, init) => {
      if (!url.startsWith("/api/team/invitations") || init?.method === "DELETE") return undefined;
      return { body: { members: [{ email: "owner@example.com", role: "OWNER" }], invitations: revoked ? [] : [{ id: "inv_1", email: "pending@example.com", role: "MEMBER", expiresAt: "2026-10-17T00:00:00.000Z" }] } };
    });
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method !== "DELETE") return answer(input, init);
      await new Promise<void>((resolve) => { finishRevoke = resolve; });
      revoked = true;
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
    });

    await act(async () => { render(<SettingsScreen />); });
    fireEvent.click(screen.getByRole("button", { name: /Team/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Revoke invitation for pending@example.com" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Revoke invitation" }));
    expect((await screen.findAllByText("Revoking…")).length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "Revoke invitation for pending@example.com" }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => { finishRevoke?.(); });
    await vi.waitFor(() => expect(screen.queryByText("pending@example.com")).toBeNull());
  });

  const team = {
    members: [
      { id: "member_owner", email: "owner@example.com", role: "OWNER" },
      { id: "member_admin", email: "ada@example.com", role: "ADMIN" },
      { id: "member_member", email: "mo@example.com", role: "MEMBER" },
    ],
    invitations: [],
  };

  it("changes another member's role at once and says Saved quietly, but never the owner's or your own", async () => {
    let finishPatch: (() => void) | undefined;
    const fetchMock = stubSettingsFetch((url, init) => {
      if (url.startsWith("/api/team/invitations")) return { body: team };
      if (url.startsWith("/api/team/members/") && init?.method === "PATCH") return { body: { member: { id: "member_member", email: "mo@example.com", role: "ADMIN" } } };
      return undefined;
    });
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === "PATCH") await new Promise<void>((resolve) => { finishPatch = resolve; });
      return answer(input, init);
    });

    await act(async () => { render(<SettingsScreen />); });
    fireEvent.click(screen.getByRole("button", { name: /Team/ }));
    const select = await screen.findByRole("combobox", { name: "Role for mo@example.com" }) as HTMLSelectElement;
    // The signed-in owner's own row is plain text, and so is any owner row.
    expect(screen.queryByRole("combobox", { name: "Role for owner@example.com" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Role for ada@example.com" })).toBeTruthy();

    fireEvent.change(select, { target: { value: "ADMIN" } });
    // Optimistic: the new role shows while the request is still out.
    expect(select.value).toBe("ADMIN");
    expect(select.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/team/members/member_member", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ role: "ADMIN" }) }));

    await act(async () => { finishPatch?.(); });
    expect((await screen.findByText("Saved")).closest("[role=status]")).toBeTruthy();
    expect(select.value).toBe("ADMIN");
    expect(select.disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("puts the role back and explains when the change is refused", async () => {
    stubSettingsFetch((url, init) => {
      if (url.startsWith("/api/team/invitations")) return { body: team };
      if (url.startsWith("/api/team/members/") && init?.method === "PATCH") return { status: 403, body: { error: "cannot_change_owner" } };
      return undefined;
    });

    await act(async () => { render(<SettingsScreen />); });
    fireEvent.click(screen.getByRole("button", { name: /Team/ }));
    const select = await screen.findByRole("combobox", { name: "Role for ada@example.com" }) as HTMLSelectElement;
    await act(async () => { fireEvent.change(select, { target: { value: "MEMBER" } }); });

    expect(await screen.findByText("The workspace owner’s role can’t be changed.")).toBeTruthy();
    expect(select.value).toBe("ADMIN");
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("marks quiet-hours changes as unsaved and defaults the timezone to the browser's", async () => {
    stubSettingsFetch((url) => (url === "/api/workspace/messaging" ? { body: { data: null } } : undefined));
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    await act(async () => { render(<SettingsScreen />); });
    fireEvent.click(screen.getByRole("button", { name: /Delivery/ }));
    await vi.waitFor(() => expect((screen.getByLabelText("Workspace timezone") as HTMLSelectElement).value).toBe(browserZone));
    expect(screen.getByLabelText("Workspace timezone").tagName).toBe("SELECT");
    expect(screen.getByText("Quiet hours disabled")).toBeTruthy();
    // No save bar while nothing has changed.
    expect(screen.queryByRole("region", { name: "Unsaved quiet hours" })).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Hold automated DMs during quiet hours" }));
    // Not "enabled" until it is actually saved.
    expect(screen.queryByText("Quiet hours enabled")).toBeNull();
    expect(screen.getByText("Quiet hours on, not saved yet")).toBeTruthy();
    const bar = screen.getByRole("region", { name: "Unsaved quiet hours" });
    expect(bar.textContent).toContain("Unsaved changes");

    // Discard puts back what the server holds.
    fireEvent.click(within(bar).getByRole("button", { name: "Discard" }));
    expect(screen.getByText("Quiet hours disabled")).toBeTruthy();
    expect((screen.getByRole("switch", { name: "Hold automated DMs during quiet hours" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole("region", { name: "Unsaved quiet hours" })).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Hold automated DMs during quiet hours" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save changes" })); });
    expect(await screen.findByText("Quiet hours enabled")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Unsaved quiet hours" }).textContent).toContain("Saved.");
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("describes demo mode in plain language", async () => {
    stubSettingsFetch((url) => (url === "/api/workspace/messaging" ? { body: { data: null } } : undefined), { mode: "demo" });

    await act(async () => { render(<SettingsScreen />); });
    fireEvent.click(screen.getByRole("button", { name: /Delivery/ }));

    expect(await screen.findByText(/Live delivery isn't set up for this workspace yet/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/DATABASE_URL|credentials/);
  });
});

describe("SettingsScreen layout", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/settings");
  });

  it("opens on the list of sections on phones and drills into one", async () => {
    stubSettingsFetch(() => undefined);
    const { container } = await act(async () => render(<SettingsScreen />));
    const root = container.querySelector(".prefs");
    // A bare /settings is the section list (phones show only that).
    expect(root?.getAttribute("data-view")).toBe("index");

    fireEvent.click(screen.getByRole("button", { name: /Delivery/ }));
    expect(root?.getAttribute("data-view")).toBe("section");
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
  });

  it("treats a section link or an OAuth return as a section page", async () => {
    window.history.replaceState({}, "", "/settings?meta=connected");
    stubSettingsFetch(() => undefined);
    const { container } = await act(async () => render(<SettingsScreen />));
    expect(container.querySelector(".prefs")?.getAttribute("data-view")).toBe("section");
  });

  it("groups the nav into Workspace and Account, with one selected item", async () => {
    window.history.replaceState({}, "", "/settings?section=billing");
    stubSettingsFetch((url) => (url === "/api/billing"
      ? { body: { data: { catalog: [], canManage: true, billingConfigured: true, entitlementPlanKey: "free", deliveriesUsed: 0, subscription: null } } }
      : url.startsWith("/api/team") ? { status: 500, body: {} } : undefined));
    await act(async () => { render(<SettingsScreen />); });

    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(nav.querySelector(".prefs-nav-tile")).toBeTruthy();
    expect(within(nav).getAllByRole("button").map((button) => button.querySelector(".prefs-nav-name")?.textContent))
      .toEqual(["Connections", "Delivery", "Team", "Billing", "Policies", "Security"]);
    expect(within(nav).getAllByRole("button").filter((button) => button.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    expect(within(nav).getByRole("button", { name: /Billing/ }).classList.contains("is-active")).toBe(true);
    // A team that fails to load only leaves the seat meter out of Billing.
    expect(await screen.findByRole("heading", { name: "Plan and usage" })).toBeTruthy();
    expect(screen.queryByText(/Could not load team settings/)).toBeNull();
  });

  it("keeps sign-in and account links under Security", async () => {
    window.history.replaceState({}, "", "/settings?section=security");
    stubSettingsFetch(() => undefined);
    await act(async () => { render(<SettingsScreen />); });

    const security = screen.getByRole("region", { name: "Security" });
    expect(within(security).getByRole("link", { name: "Change password" }).getAttribute("href")).toBe("/profile");
    expect(within(security).getByRole("link", { name: "Manage sessions" }).getAttribute("href")).toBe("/profile");
    expect(within(security).getByRole("link", { name: /^Delete your data/ }).getAttribute("href")).toBe("/data-deletion");
  });

  it("marks the signed-in person in the member list", async () => {
    window.history.replaceState({}, "", "/settings?section=team");
    stubSettingsFetch((url) => (url.startsWith("/api/team/invitations")
      ? { body: { members: [{ email: "owner@example.com", role: "OWNER" }, { email: "helper@example.com", role: "MEMBER" }], invitations: [] } }
      : undefined));
    await act(async () => { render(<SettingsScreen />); });

    const members = await screen.findByRole("region", { name: /Members/ });
    await vi.waitFor(() => expect(within(screen.getByText("owner@example.com").closest("li")!).getByText("You")).toBeTruthy());
    expect(within(screen.getByText("helper@example.com").closest("li")!).queryByText("You")).toBeNull();
    expect(within(members).getByText("Owner")).toBeTruthy();
    // No pending invitations, so no empty group for them.
    expect(screen.queryByRole("region", { name: /Pending invitations/ })).toBeNull();
  });
});
