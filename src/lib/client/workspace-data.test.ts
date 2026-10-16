import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearWorkspaceDataCache,
  getAccountProfile,
  getBillingView,
  getFacebookPages,
  getInstagramConnections,
  getInsightsOverview,
  getTeamOverview,
  insightsOverviewUrl,
  peekInsightsOverview,
  getWorkspaceBootstrap,
  backoffDelay,
  invalidateWorkspaceResource,
  notifyWorkspaceChanged,
  peekWorkspaceBootstrap,
  refreshWorkspaceBootstrap,
  seedWorkspaceData,
  WORKSPACE_CHANGE_EVENT,
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

  it("uses server-seeded data without an immediate duplicate fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    seedWorkspaceData({
      insightsOverview: { capturedEmails: 7 },
      instagramConnections: [],
      facebookPages: [],
    });

    expect(await getInsightsOverview()).toMatchObject({ capturedEmails: 7 });
    expect(await getInstagramConnections()).toEqual([]);
    expect(await getFacebookPages()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps one overview per window, with the plain URL for 14 days", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const days = new URL(String(input), "http://x").searchParams.get("days") ?? "14";
      return { ok: true, json: async () => ({ timeseries: { days: Number(days) } }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await getInsightsOverview()).toMatchObject({ timeseries: { days: 14 } });
    expect(await getInsightsOverview({ days: 7 })).toMatchObject({ timeseries: { days: 7 } });
    expect(await getInsightsOverview({ days: 30 })).toMatchObject({ timeseries: { days: 30 } });
    // Switching back is answered from memory.
    expect(await getInsightsOverview({ days: 7 })).toMatchObject({ timeseries: { days: 7 } });
    expect(peekInsightsOverview(30)).toMatchObject({ timeseries: { days: 30 } });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/insights?include=overview",
      "/api/insights?include=overview&days=7",
      "/api/insights?include=overview&days=30",
    ]);
    expect(insightsOverviewUrl(14)).toBe("/api/insights?include=overview");

    invalidateWorkspaceResource("insights-overview");
    expect(peekInsightsOverview(7)).toBeUndefined();
    await getInsightsOverview({ days: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("seeds a server-rendered overview under the window it describes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    seedWorkspaceData({ insightsOverview: { timeseries: { days: 7 }, capturedEmails: 3 } });

    expect(await getInsightsOverview({ days: 7 })).toMatchObject({ capturedEmails: 3 });
    expect(peekInsightsOverview(14)).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("keeps confirmed data fresh for two minutes and refreshes stale data in the background", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { catalog: [], canManage: true, billingConfigured: true, entitlementPlanKey: fetchMock.mock.calls.length === 1 ? "creator" : "growth", deliveriesUsed: 0, subscription: null } }),
    }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    expect((await getBillingView()).entitlementPlanKey).toBe("creator");
    now += 119_999;
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

  it("drops the identity caches and tells the shell to refetch after a workspace change", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/workspace/bootstrap") return { ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }) } as Response;
      if (url === "/api/account") return { ok: true, json: async () => ({ data: { id: "user_1", email: "owner@example.com", plan: "free" } }) } as Response;
      if (url === "/api/billing") return { ok: true, json: async () => ({ data: { catalog: [], canManage: true, billingConfigured: true, entitlementPlanKey: "free", deliveriesUsed: 0, subscription: null } }) } as Response;
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const listener = vi.fn();
    target.addEventListener(WORKSPACE_CHANGE_EVENT, listener);

    await Promise.all([getWorkspaceBootstrap(), getAccountProfile(), getBillingView()]);
    notifyWorkspaceChanged();
    await Promise.all([getWorkspaceBootstrap(), getAccountProfile(), getBillingView()]);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(WORKSPACE_CHANGE_EVENT).toBe("linkar-workspace-change");
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/workspace/bootstrap")).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/account")).toHaveLength(2);
    // Billing owns its own cache; the helper only touches shell identity.
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/billing")).toHaveLength(1);
  });

  describe("throttled bootstrap refresh", () => {
    function stubBootstrap() {
      let release: (() => void) | undefined;
      let hold = false;
      const fetchMock = vi.fn(async () => {
        if (hold) await new Promise<void>((resolve) => { release = resolve; });
        return { ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: `plan_${fetchMock.mock.calls.length}` } }) } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);
      return { fetchMock, holdNext: () => { hold = true; }, release: () => { hold = false; release?.(); } };
    }

    afterEach(() => vi.restoreAllMocks());

    it("skips while the confirmed value is younger than minAgeMs, then refetches", async () => {
      let now = 10_000;
      vi.spyOn(Date, "now").mockImplementation(() => now);
      const { fetchMock } = stubBootstrap();

      await getWorkspaceBootstrap();
      expect(peekWorkspaceBootstrap()?.plan).toBe("plan_1");
      now += 59_999;
      expect((await refreshWorkspaceBootstrap({ minAgeMs: 60_000 })).plan).toBe("plan_1");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      now += 1;
      expect((await refreshWorkspaceBootstrap({ minAgeMs: 60_000 })).plan).toBe("plan_2");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("shares a request already in flight instead of starting another", async () => {
      const { fetchMock, holdNext, release } = stubBootstrap();
      holdNext();
      const first = refreshWorkspaceBootstrap({ minAgeMs: 60_000 });
      const second = refreshWorkspaceBootstrap({ minAgeMs: 60_000 });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      release();
      expect(await first).toEqual(await second);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("still refetches straight away without minAgeMs, as after a workspace change", async () => {
      const { fetchMock } = stubBootstrap();
      await getWorkspaceBootstrap();
      expect((await refreshWorkspaceBootstrap()).plan).toBe("plan_2");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("sends at most one request for 5 focus refreshes within 60 s while the server answers 502, keeping the last good value", async () => {
      let now = 1_000_000;
      vi.spyOn(Date, "now").mockImplementation(() => now);
      let failing = false;
      const fetchMock = vi.fn(async () => failing
        ? ({ ok: false, status: 502, json: async () => ({}) } as Response)
        : ({ ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "creator" } }) } as Response));
      vi.stubGlobal("fetch", fetchMock);

      await getWorkspaceBootstrap();
      failing = true;
      now += 61_000;
      const results: string[] = [];
      for (let focus = 0; focus < 5; focus += 1) {
        results.push(await refreshWorkspaceBootstrap({ minAgeMs: 60_000 }).then((data) => data.plan, () => "failed"));
        now += 5_000;
      }

      expect(fetchMock).toHaveBeenCalledTimes(2);
      // The failed refresh neither empties the cache nor lets the next focus through.
      expect(results).toEqual(["failed", "creator", "creator", "creator", "creator"]);
      expect(peekWorkspaceBootstrap()?.plan).toBe("creator");

      // A minute after the failed attempt it may try again.
      now += 40_000;
      await refreshWorkspaceBootstrap({ minAgeMs: 60_000 }).catch(() => undefined);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("throttles on the failed attempt too when nothing was ever confirmed", async () => {
      let now = 5_000;
      vi.spyOn(Date, "now").mockImplementation(() => now);
      const fetchMock = vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }) as Response);
      vi.stubGlobal("fetch", fetchMock);

      for (let focus = 0; focus < 5; focus += 1) {
        await expect(refreshWorkspaceBootstrap({ minAgeMs: 60_000 })).rejects.toThrow();
        now += 5_000;
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(peekWorkspaceBootstrap()).toBeUndefined();
    });

    it("has nothing to peek at before a bootstrap is confirmed", () => {
      stubBootstrap();
      expect(peekWorkspaceBootstrap()).toBeUndefined();
    });
  });

  describe("a superseded request answering late", () => {
    /** Every bootstrap request waits until the test answers it, in any order. */
    function stubAnswerable() {
      const answers: Array<(plan: string | null) => void> = [];
      const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
        answers.push((plan) => resolve(plan === null
          ? ({ ok: false, status: 502, json: async () => ({}) } as Response)
          : ({ ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan } }) } as Response)));
      }));
      vi.stubGlobal("fetch", fetchMock);
      return { fetchMock, answer: (index: number, plan: string | null) => answers[index](plan) };
    }

    it("never overwrites the newer answer: the cache and peek keep pro when the older request answers free last", async () => {
      const { fetchMock, answer } = stubAnswerable();
      // R1: the shell's first read, still out when billing changes.
      const first = getWorkspaceBootstrap();
      // The upgrade invalidates the bootstrap and the shell refetches: R2.
      const second = refreshWorkspaceBootstrap();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      answer(1, "pro");
      expect((await second).plan).toBe("pro");
      expect(peekWorkspaceBootstrap()?.plan).toBe("pro");

      answer(0, "free");
      // The old answer still settles for its own caller...
      expect((await first).plan).toBe("free");
      // ...but the cache, and whoever reads it next, keep the newer one.
      expect(peekWorkspaceBootstrap()?.plan).toBe("pro");
      expect((await getWorkspaceBootstrap()).plan).toBe("pro");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("keeps sharing the newer request when the older one answers first", async () => {
      const { fetchMock, answer } = stubAnswerable();
      const first = getWorkspaceBootstrap();
      const second = refreshWorkspaceBootstrap();

      answer(0, "free");
      expect((await first).plan).toBe("free");
      // R2 is still the entry's request: nothing stale was cached meanwhile.
      expect(peekWorkspaceBootstrap()).toBeUndefined();
      const third = getWorkspaceBootstrap();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      answer(1, "pro");
      expect((await second).plan).toBe("pro");
      expect((await third).plan).toBe("pro");
      expect(peekWorkspaceBootstrap()?.plan).toBe("pro");
    });

    it("does not clear the newer request when the older one fails late", async () => {
      const { fetchMock, answer } = stubAnswerable();
      const first = getWorkspaceBootstrap();
      const second = refreshWorkspaceBootstrap();

      answer(0, null);
      await expect(first).rejects.toThrow();
      // Still shared: a new reader waits on R2 instead of sending R3.
      const third = getWorkspaceBootstrap();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      answer(1, "pro");
      expect((await third).plan).toBe("pro");
      await second;
    });

    it("drops an answer to a request made before the cache was cleared", async () => {
      const { fetchMock, answer } = stubAnswerable();
      const first = getWorkspaceBootstrap();
      clearWorkspaceDataCache();

      answer(0, "free");
      expect((await first).plan).toBe("free");
      expect(peekWorkspaceBootstrap()).toBeUndefined();
      // The next read asks again instead of serving the pre-clear answer.
      const next = getWorkspaceBootstrap();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      answer(1, "pro");
      expect((await next).plan).toBe("pro");
    });
  });

  it("backs off by doubling with a little jitter, never past the cap", () => {
    const middle = () => 0.5;
    expect([1, 2, 3, 4, 5, 6].map((attempt) => backoffDelay(attempt, { baseMs: 2_000, capMs: 30_000, random: middle }))).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
    expect(backoffDelay(1, { baseMs: 2_000, capMs: 30_000, random: () => 0 })).toBe(1_600);
    expect(backoffDelay(1, { baseMs: 2_000, capMs: 30_000, random: () => 0.999 })).toBeLessThanOrEqual(2_400);
    expect(backoffDelay(9, { baseMs: 2_000, capMs: 30_000, random: () => 0.999 })).toBe(30_000);
  });
});
