import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({})); const { createAdminSystemService } = await import("./service");
afterEach(() => vi.unstubAllEnvs());
describe("admin system service", () => { it("returns a partial degraded snapshot when Redis/queue probing fails", async () => { const service = createAdminSystemService({ health: vi.fn().mockResolvedValue({ status: "degraded", release: "abc", dependencies: { database: "ok", redis: "error" }, integrations: { instagram: "configured", facebook: "configured" }, capabilities: { followGatedCampaigns: "enabled" } }), queueSnapshot: vi.fn().mockRejectedValue(new Error("timeout")), now: () => new Date("2026-08-31T10:00:00.000Z") }); const result = await service.snapshot(); expect(result.overall).toBe("degraded"); expect(result.database.state).toBe("healthy"); expect(result.redis.state).toBe("unavailable"); expect(result.queues).toHaveLength(2); expect(result.queues.every((queue) => queue.paused === null)).toBe(true); expect(result.rateLimits.state).toBe("unavailable"); expect(result.operationalDataAvailable).toBe(false); expect(result.capabilities.followGatedCampaigns).toBe("enabled"); }); it("never returns environment values or job payloads", async () => { const service = createAdminSystemService({ health: vi.fn().mockResolvedValue({ status: "ok", release: "abc", dependencies: { database: "not_configured", redis: "not_configured" }, integrations: { instagram: "not_configured", facebook: "not_configured" }, capabilities: { followGatedCampaigns: "disabled" } }), queueSnapshot: vi.fn().mockResolvedValue({ name: "webhooks", configured: false, paused: null, waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0, oldestWaitingAgeMs: null, lastFailedCode: null }) }); expect(JSON.stringify(await service.snapshot())).not.toMatch(/DATABASE_URL|REDIS_URL|service_role|jobData|accessToken|postgresql:\/\//); }); });

describe("billing and incident posture", () => {
  it("reports complete Razorpay configuration using presence only", async () => {
    for (const [name, value] of Object.entries({
      RAZORPAY_KEY_ID: "rzp_live_public", RAZORPAY_KEY_SECRET: "key-secret", RAZORPAY_WEBHOOK_SECRET: "webhook-secret",
      RAZORPAY_PLAN_CREATOR_MONTHLY_ID: "plan_1", RAZORPAY_PLAN_CREATOR_ANNUAL_ID: "plan_2",
      RAZORPAY_PLAN_GROWTH_MONTHLY_ID: "plan_3", RAZORPAY_PLAN_GROWTH_ANNUAL_ID: "plan_4",
      RAZORPAY_PLAN_AGENCY_MONTHLY_ID: "plan_5", RAZORPAY_PLAN_AGENCY_ANNUAL_ID: "plan_6",
    })) vi.stubEnv(name, value);
    const service = createAdminSystemService({
      health: vi.fn().mockResolvedValue({ status: "ok", release: "abc", dependencies: { database: "not_configured", redis: "not_configured" }, integrations: { instagram: "not_configured", facebook: "not_configured" }, capabilities: { followGatedCampaigns: "disabled" } }),
      queueSnapshot: vi.fn().mockResolvedValue({ name: "webhooks", configured: false, paused: null, waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0, oldestWaitingAgeMs: null, lastFailedCode: null }),
    });
    const result = await service.snapshot();
    expect(result.billing).toEqual({ configured: true, failedWebhooksLastHour: null, driftedSubscriptions: null });
    expect(result.configurationPresence).toContainEqual({ requirement: "Razorpay billing", present: true });
    expect(JSON.stringify(result)).not.toContain("key-secret");
  });

  it("projects bounded operational counts and recent incidents", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://linkar:linkar@localhost:5432/linkar");
    const operationalData = vi.fn().mockResolvedValue({
      stuckClaims: 2, webhookLastHour: 44, deletionJobs: { queued: 1, running: 0, failed: 1 },
      failedBillingWebhooksLastHour: 3, driftedSubscriptions: 1,
      incidents: [{ id: "i_1", severity: "CRITICAL", status: "OPEN", source: "billing", title: "Webhook failed", detail: "3 failed", firstSeenAt: new Date("2026-09-05T06:00:00Z"), lastSeenAt: new Date("2026-09-05T06:01:00Z"), resolvedAt: null, occurrenceCount: 2 }],
    });
    const service = createAdminSystemService({
      health: vi.fn().mockResolvedValue({ status: "ok", release: "abc", dependencies: { database: "ok", redis: "ok" }, integrations: { instagram: "configured", facebook: "configured" }, capabilities: { followGatedCampaigns: "enabled" } }),
      queueSnapshot: vi.fn().mockResolvedValue({ name: "webhooks", configured: true, paused: false, waiting: 0, active: 0, delayed: 0, completed: 1, failed: 0, oldestWaitingAgeMs: null, lastFailedCode: null }),
      operationalData,
    });
    const result = await service.snapshot();
    expect(result.billing).toMatchObject({ failedWebhooksLastHour: 3, driftedSubscriptions: 1 });
    expect(result.incidents[0]).toMatchObject({ id: "i_1", severity: "CRITICAL", status: "OPEN" });
  });
});

describe("worker state", () => {
  const now = new Date("2026-10-11T10:00:00.000Z");
  const health = () => vi.fn().mockResolvedValue({ status: "ok", release: "abc", dependencies: { database: "ok", redis: "ok" }, integrations: { instagram: "configured", facebook: "configured" }, capabilities: { followGatedCampaigns: "enabled" } });
  const queueSnapshot = () => vi.fn().mockResolvedValue({ name: "webhooks", configured: true, paused: false, waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0, oldestWaitingAgeMs: null, lastFailedCode: null });

  // Production regression: the worker sits on its own Docker network, so the
  // URL probe always failed and the page said "Unavailable" for a healthy worker.
  it("reports a fresh Redis heartbeat as healthy without probing the unreachable worker URL", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("WORKER_HEALTH_URL", "http://worker:3001/health");
    const fetchMock = vi.fn().mockRejectedValue(new Error("ENOTFOUND worker"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const service = createAdminSystemService({ health: health(), queueSnapshot: queueSnapshot(), now: () => now, workerHeartbeat: async () => ({ at: now.getTime() - 20_000, release: "e4afaee" }) });
      const result = await service.snapshot();
      expect(result.worker).toEqual({ state: "healthy", release: "e4afaee", lastSeenAt: "2026-10-11T09:59:40.000Z" });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it("flags a stale or missing heartbeat as needing attention", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    const stale = await createAdminSystemService({ health: health(), queueSnapshot: queueSnapshot(), now: () => now, workerHeartbeat: async () => ({ at: now.getTime() - 5 * 60_000, release: "e4afaee" }) }).snapshot();
    expect(stale.worker).toMatchObject({ state: "degraded", release: "e4afaee", lastSeenAt: "2026-10-11T09:55:00.000Z" });
    expect(stale.worker.detail).toMatch(/No heartbeat/);
    expect(stale.overall).toBe("degraded");
    const missing = await createAdminSystemService({ health: health(), queueSnapshot: queueSnapshot(), now: () => now, workerHeartbeat: async () => null }).snapshot();
    expect(missing.worker).toMatchObject({ state: "degraded", lastSeenAt: null });
  });

  it("falls back to the worker URL only when the heartbeat cannot be read", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("WORKER_HEALTH_URL", "http://worker:3001/health");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await createAdminSystemService({ health: health(), queueSnapshot: queueSnapshot(), now: () => now, workerHeartbeat: async () => { throw new Error("redis down"); } }).snapshot();
      expect(fetchMock).toHaveBeenCalledWith("http://worker:3001/health", expect.anything());
      expect(result.worker.state).toBe("healthy");
    } finally { vi.unstubAllGlobals(); }
  });

  it("tells the owner exactly which settings turn on owner email alerts", async () => {
    vi.stubEnv("EMAIL_API_KEY", "");
    const result = await createAdminSystemService({ health: health(), queueSnapshot: queueSnapshot(), now: () => now, workerHeartbeat: async () => null }).snapshot();
    const alerts = result.configurationPresence.find((item) => item.requirement === "Owner email alerts");
    expect(alerts).toMatchObject({ present: false });
    expect(alerts?.fix).toMatch(/EMAIL_API_KEY.*EMAIL_FROM.*PLATFORM_ALERT_EMAILS/);
  });
});
