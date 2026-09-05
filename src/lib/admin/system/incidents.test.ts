import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { evaluateSystemIncidents, reconcileSystemIncidents } = await import("./incidents");

const healthySnapshot = {
  overall: "healthy" as const,
  generatedAt: "2026-09-05T06:00:00.000Z",
  release: "abc123",
  web: { state: "healthy" as const },
  database: { state: "healthy" as const },
  redis: { state: "healthy" as const },
  worker: { state: "healthy" as const },
  queues: [],
  stuckClaims: 0,
  webhookThroughput: { lastHour: 12 },
  deletionJobs: { queued: 0, running: 0, failed: 0 },
  billing: { configured: true, failedWebhooksLastHour: 0, driftedSubscriptions: 0 },
  configurationPresence: [],
  capabilities: { followGatedCampaigns: "enabled" as const },
  reconciliation: { expiredDeliveryClaims: 0 },
  rateLimits: { state: "healthy" as const },
  incidents: [],
};

describe("system incident evaluation", () => {
  it("opens critical component and billing failures without leaking probe detail", () => {
    const result = evaluateSystemIncidents({
      ...healthySnapshot,
      database: { state: "unavailable" as const, detail: "postgresql://secret@db" },
      billing: { configured: false, failedWebhooksLastHour: 2, driftedSubscriptions: 0 },
    }, new Date("2026-09-05T06:00:30.000Z"));

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ fingerprint: "component:database:unavailable", severity: "CRITICAL" }),
      expect.objectContaining({ fingerprint: "billing:configuration", severity: "CRITICAL" }),
      expect.objectContaining({ fingerprint: "billing:webhooks:failed", severity: "CRITICAL" }),
    ]));
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("uses warning and critical queue thresholds deterministically", () => {
    const warning = evaluateSystemIncidents({
      ...healthySnapshot,
      queues: [{ name: "webhooks", configured: true, paused: false, waiting: 120, active: 1, delayed: 0, completed: 20, failed: 1, oldestWaitingAgeMs: 11 * 60_000, lastFailedCode: "provider_error" }],
    }, new Date("2026-09-05T06:00:30.000Z"));
    expect(warning).toEqual(expect.arrayContaining([
      expect.objectContaining({ fingerprint: "queue:webhooks:backlog", severity: "WARNING" }),
      expect.objectContaining({ fingerprint: "queue:webhooks:failed", severity: "WARNING" }),
    ]));

    const critical = evaluateSystemIncidents({
      ...healthySnapshot,
      queues: [{ name: "webhooks", configured: true, paused: false, waiting: 500, active: 1, delayed: 0, completed: 20, failed: 25, oldestWaitingAgeMs: 31 * 60_000, lastFailedCode: null }],
    }, new Date("2026-09-05T06:00:30.000Z"));
    expect(critical).toEqual(expect.arrayContaining([
      expect.objectContaining({ fingerprint: "queue:webhooks:backlog", severity: "CRITICAL" }),
      expect.objectContaining({ fingerprint: "queue:webhooks:failed", severity: "CRITICAL" }),
    ]));
  });

  it("flags a stale snapshot but leaves a healthy fresh snapshot empty", () => {
    expect(evaluateSystemIncidents(healthySnapshot, new Date("2026-09-05T06:00:30.000Z"))).toEqual([]);
    expect(evaluateSystemIncidents(healthySnapshot, new Date("2026-09-05T06:01:01.000Z")))
      .toContainEqual(expect.objectContaining({ fingerprint: "system:snapshot:stale", severity: "WARNING" }));
  });
});

describe("system incident lifecycle", () => {
  it("opens, refreshes, escalates, and resolves active fingerprints", async () => {
    const repository = {
      listActive: vi.fn().mockResolvedValue([
        { id: "i_existing", fingerprint: "queue:webhooks:backlog", severity: "WARNING", status: "OPEN" },
        { id: "i_recovered", fingerprint: "component:redis:unavailable", severity: "CRITICAL", status: "OPEN" },
      ]),
      open: vi.fn().mockImplementation(async (candidate) => ({ id: "i_new", ...candidate, status: "OPEN" })),
      refresh: vi.fn().mockImplementation(async (id, candidate) => ({ id, ...candidate, status: "OPEN" })),
      resolve: vi.fn().mockImplementation(async (id) => ({ id, status: "RESOLVED" })),
    };

    const events = await reconcileSystemIncidents([
      { fingerprint: "queue:webhooks:backlog", source: "queue:webhooks", title: "Webhook queue backlog", detail: "500 waiting", severity: "CRITICAL" },
      { fingerprint: "billing:configuration", source: "billing", title: "Razorpay is not configured", detail: "Required values are missing", severity: "CRITICAL" },
    ], repository, new Date("2026-09-05T06:02:00.000Z"));

    expect(events.map((event) => event.kind)).toEqual(["ESCALATED", "OPENED", "RESOLVED"]);
    expect(repository.refresh).toHaveBeenCalledWith("i_existing", expect.objectContaining({ severity: "CRITICAL" }), expect.any(Date), true);
    expect(repository.open).toHaveBeenCalledTimes(1);
    expect(repository.resolve).toHaveBeenCalledWith("i_recovered", expect.any(Date));
  });
});
