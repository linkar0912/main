import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearWorkspaceDataCache,
  getBillingView,
  getFacebookPages,
  getInstagramConnections,
  getTeamOverview,
  getWorkspaceBootstrap,
  invalidateWorkspaceResource,
} from "./workspace-data";

describe("workspace client data cache", () => {
  afterEach(() => {
    clearWorkspaceDataCache();
    vi.unstubAllGlobals();
  });

  it("deduplicates workspace identity and connection requests across page remounts", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/workspace/bootstrap") {
        return { ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }) } as Response;
      }
      if (url === "/api/meta/connection") {
        return { ok: true, json: async () => ({ data: [{ igUserId: "ig_1", username: "creator" }] }) } as Response;
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([getWorkspaceBootstrap(), getWorkspaceBootstrap()]);
    await Promise.all([getInstagramConnections(), getInstagramConnections()]);
    await getWorkspaceBootstrap();
    await getInstagramConnections();

    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/workspace/bootstrap")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/meta/connection")).toHaveLength(1);
  });

  it("can invalidate connection data after a disconnect", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    await getInstagramConnections();
    clearWorkspaceDataCache("connections");
    await getInstagramConnections();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates Facebook Page fetches and resets when the connections cache is cleared", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/facebook/connection") {
        return { ok: true, json: async () => ({ data: [{ id: "fb_rec_1", pageId: "12345", pageName: "Acme", status: "CONNECTED", connectedAt: "2026-08-29T10:00:00.000Z" }] }) } as Response;
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([getFacebookPages(), getFacebookPages()]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/facebook/connection")).toHaveLength(1);

    clearWorkspaceDataCache("connections");
    await getFacebookPages();
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/facebook/connection")).toHaveLength(2);
  });

  it("deduplicates concurrent billing requests", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { catalog: [], canManage: true, billingConfigured: true, entitlementPlanKey: "creator", deliveriesUsed: 0, subscription: null } }),
    }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([getBillingView(), getBillingView()]);

    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps confirmed data fresh for 30 seconds and refreshes stale data in the background", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { catalog: [], canManage: true, billingConfigured: true, entitlementPlanKey: fetchMock.mock.calls.length === 1 ? "creator" : "growth", deliveriesUsed: 0, subscription: null } }),
    }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    expect((await getBillingView()).entitlementPlanKey).toBe("creator");
    now += 29_999;
    expect((await getBillingView()).entitlementPlanKey).toBe("creator");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += 2;
    expect((await getBillingView()).entitlementPlanKey).toBe("creator");
    await vi.waitFor(async () => expect((await getBillingView()).entitlementPlanKey).toBe("growth"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache failed requests", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [], invitations: [] }) } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTeamOverview()).rejects.toThrow("Could not load /api/team/invitations");
    await expect(getTeamOverview()).resolves.toEqual({ members: [], invitations: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalidates only the requested workspace resource", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/billing") {
        return { ok: true, json: async () => ({ data: { catalog: [], canManage: true, billingConfigured: true, entitlementPlanKey: "creator", deliveriesUsed: 0, subscription: null } }) } as Response;
      }
      return { ok: true, json: async () => ({ members: [], invitations: [] }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([getBillingView(), getTeamOverview()]);
    invalidateWorkspaceResource("billing");
    await Promise.all([getBillingView(), getTeamOverview()]);

    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/billing")).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/team/invitations")).toHaveLength(1);
  });

  it("lets one caller abort without cancelling a shared request", async () => {
    let finishRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeUndefined();
      return new Promise<Response>((resolve) => { finishRequest = resolve; });
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const cancelledCaller = getBillingView(controller.signal);
    const activeCaller = getBillingView();
    controller.abort();
    finishRequest?.({
      ok: true,
      json: async () => ({ data: { catalog: [], canManage: true, billingConfigured: true, entitlementPlanKey: "growth", deliveriesUsed: 0, subscription: null } }),
    } as Response);

    await expect(cancelledCaller).rejects.toMatchObject({ name: "AbortError" });
    await expect(activeCaller).resolves.toMatchObject({ entitlementPlanKey: "growth" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
