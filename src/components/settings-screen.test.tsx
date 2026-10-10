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
    await screen.findByLabelText("Invite by email");
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
    const connectLink = screen.getByRole("link", { name: /Connect Facebook Page/ });
    expect(connectLink.getAttribute("href")).toBe("/api/facebook/oauth/start");

    const instagramCard = screen.getByText("Instagram connections").closest("[data-channel-card]");
    const facebookCard = screen.getByText("Facebook Pages").closest("[data-channel-card]");
    expect(instagramCard?.getAttribute("data-channel-card")).toBe("instagram");
    expect(facebookCard?.getAttribute("data-channel-card")).toBe("facebook");
    expect(instagramCard?.classList.contains("channel-settings-card")).toBe(true);
    expect(facebookCard?.classList.contains("channel-settings-card")).toBe(true);
    expect(instagramCard?.querySelector('[data-brand-logo="instagram"]')).toBeTruthy();
    expect(facebookCard?.querySelector('[data-brand-logo="facebook"]')).toBeTruthy();
    expect(instagramCard?.querySelector('[data-channel-health="instagram"]')).toBeNull();
    expect(facebookCard?.querySelector('[data-channel-health="facebook"]')).toBeNull();
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

    const summary = await screen.findByRole("region", { name: "Workspace pulse" });
    expect(summary.textContent).toContain("2 connected channels");
    expect(summary.textContent).toContain("Live");
    expect(within(summary).getByRole("group", { name: "Mode status" })).toBeTruthy();
    expect(within(summary).getByRole("group", { name: "Channel status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Connections/ }).getAttribute("aria-pressed")).toBe("true");

    const instagramCard = screen.getByText("Instagram connections").closest('[data-channel-card="instagram"]');
    const facebookCard = screen.getByText("Facebook Pages").closest('[data-channel-card="facebook"]');
    expect(instagramCard?.querySelector('[data-channel-health="instagram"]')).toBeTruthy();
    expect(facebookCard?.querySelector('[data-channel-health="facebook"]')).toBeTruthy();
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

    const consoleRegion = await screen.findByRole("region", { name: "Connected channels" });
    expect(consoleRegion.querySelectorAll("[data-channel-card]")).toHaveLength(2);
    expect(within(consoleRegion).getByRole("region", { name: "Instagram channel" })).toBeTruthy();
    expect(within(consoleRegion).getByRole("region", { name: "Facebook channel" })).toBeTruthy();
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

    expect(await screen.findByText("@creator_one: All caught up")).toBeTruthy();
    expect(await screen.findByText("@creator_two: Some fields need a reconnect")).toBeTruthy();
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
    fireEvent.change(await screen.findByLabelText("Invite by email"), { target: { value: "new@example.com" } });
    await act(async () => { fireEvent.submit(screen.getByLabelText("Invite by email").closest("form")!); });

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
    fireEvent.change(await screen.findByLabelText("Invite by email"), { target: { value: "new@example.com" } });
    await act(async () => { fireEvent.submit(screen.getByLabelText("Invite by email").closest("form")!); });

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

  it("marks quiet-hours changes as unsaved and defaults the timezone to the browser's", async () => {
    stubSettingsFetch((url) => (url === "/api/workspace/messaging" ? { body: { data: null } } : undefined));
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    await act(async () => { render(<SettingsScreen />); });
    fireEvent.click(screen.getByRole("button", { name: /Delivery/ }));
    await vi.waitFor(() => expect((screen.getByLabelText("Workspace timezone") as HTMLSelectElement).value).toBe(browserZone));
    expect(screen.getByLabelText("Workspace timezone").tagName).toBe("SELECT");
    expect(screen.getByText("Quiet hours disabled")).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: "Hold automated DMs during quiet hours" }));
    // Not "enabled" until it is actually saved.
    expect(screen.queryByText("Quiet hours enabled")).toBeNull();
    expect(screen.getByText("Quiet hours on, not saved yet")).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save messaging hours" })); });
    expect(await screen.findByText("Quiet hours enabled")).toBeTruthy();
  });

  it("describes demo mode in plain language", async () => {
    stubSettingsFetch((url) => (url === "/api/workspace/messaging" ? { body: { data: null } } : undefined), { mode: "demo" });

    await act(async () => { render(<SettingsScreen />); });
    fireEvent.click(screen.getByRole("button", { name: /Delivery/ }));

    expect(await screen.findByText(/Live delivery isn't set up for this workspace yet/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/DATABASE_URL|credentials/);
  });
});
