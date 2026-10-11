// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react"; import userEvent from "@testing-library/user-event"; import { afterEach, describe, expect, it, vi } from "vitest"; vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) })); const { SystemConsole, serviceProblems } = await import("./system-console"); afterEach(cleanup); const snapshot = { overall: "degraded" as const, generatedAt: "2026-08-31T10:00:00.000Z", release: "abc123", web: { state: "healthy" as const }, database: { state: "healthy" as const }, redis: { state: "unavailable" as const, detail: "Probe failed" }, worker: { state: "degraded" as const, detail: "No heartbeat" }, queues: [{ name: "webhooks" as const, configured: true, paused: false, waiting: 2, active: 1, delayed: 0, completed: 20, failed: 1, oldestWaitingAgeMs: 2000, lastFailedCode: "PROVIDER_REJECTED" }], stuckClaims: 1, webhookThroughput: { lastHour: 40 }, deletionJobs: { queued: 0, running: 0, failed: 0 }, billing: { configured: false, failedWebhooksLastHour: 1, driftedSubscriptions: 0 }, incidents: [], configurationPresence: [{ requirement: "Database", present: true }], capabilities: { followGatedCampaigns: "enabled" as const }, reconciliation: { expiredDeliveryClaims: 1 }, rateLimits: { state: "healthy" as const } };
describe("SystemConsole", () => { it("labels partial outages in text rather than color alone", () => { render(<SystemConsole snapshot={snapshot} />); expect(screen.getByText("Probe failed").parentElement?.textContent).toContain("Down"); expect(screen.getByText("No heartbeat").parentElement?.textContent).toContain("Needs attention"); expect(screen.getByText("Latest failure:", { exact: false })).toBeTruthy(); }); it("requires a reason dialog before pausing a queue", async () => { render(<SystemConsole snapshot={snapshot} />); await userEvent.click(screen.getByRole("button", { name: "Pause queue" })); expect(screen.getByRole("dialog", { name: "Pause Incoming events" })).toBeTruthy(); expect(screen.getByRole("textbox", { name: /^Reason/ })).toBeTruthy(); }); });

describe("incident operations view", () => {
  it("renders active and recovered incidents with explicit text states", () => {
    render(<SystemConsole snapshot={{
      ...snapshot,
      incidents: [
        { id: "i_1", severity: "CRITICAL", status: "OPEN", source: "billing", title: "Razorpay webhook processing failed", detail: "2 billing webhooks failed.", firstSeenAt: "2026-09-05T06:00:00Z", lastSeenAt: "2026-09-05T06:03:00Z", resolvedAt: null, occurrenceCount: 2 },
        { id: "i_2", severity: "WARNING", status: "RESOLVED", source: "queue:webhooks", title: "Webhook queue paused", detail: "Queue processing was paused.", firstSeenAt: "2026-09-05T05:00:00Z", lastSeenAt: "2026-09-05T05:10:00Z", resolvedAt: "2026-09-05T05:10:00Z", occurrenceCount: 1 },
      ],
    }} />);
    expect(screen.getByRole("table", { name: "Production incidents" })).toBeTruthy();
    expect(screen.getByText("Critical")).toBeTruthy();
    expect(screen.getByText("Recovered")).toBeTruthy();
    expect(screen.getByText("1 active incident, 1 recovered in the last 24 hours")).toBeTruthy();
    // The open incident is also one of the problems listed in the banner, with its detail as the fix.
    const banner = screen.getByRole("region", { name: /things need attention/ });
    expect(within(banner).getByText("Razorpay webhook processing failed")).toBeTruthy();
  });

  it("shows a calm empty incident state and explicit billing readiness", () => {
    render(<SystemConsole snapshot={snapshot} />);
    expect(screen.getByText("No incidents in the last 24 hours")).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Production incidents" })).toBeNull();
    expect(screen.getByText(/Razorpay billing is not set up, so customers cannot pay/)).toBeTruthy();
    expect(within(screen.getByRole("region", { name: /things need attention/ })).getByText("Razorpay billing is not set up")).toBeTruthy();
  });
});

it("ages a snapshot even when refreshes fail", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(snapshot.generatedAt));
  try {
    render(<SystemConsole snapshot={snapshot} />);
    expect(screen.queryByText(/may be out of date/)).toBeNull();
    act(() => vi.advanceTimersByTime(65_000));
    expect(screen.getByText(/may be out of date/)).toBeTruthy();
  } finally { cleanup(); vi.useRealTimers(); }
});
it("lists failed jobs and retries only the selected IDs through the reason dialog", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ data: [
      { id: "j1", name: "instagram-event", failedAt: "2026-09-05T06:00:00.000Z", attemptsMade: 3, code: "PROVIDER_REJECTED" },
      { id: "j2", name: "broadcast-send", failedAt: null, attemptsMade: 1, code: null },
    ] }))
    .mockResolvedValueOnce(Response.json({ data: { retried: ["j2"] } }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    render(<SystemConsole snapshot={snapshot} />);
    await userEvent.click(screen.getByRole("button", { name: "Review failed jobs" }));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/system/queues/webhooks");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select failed job j2" }));
    await userEvent.click(screen.getByRole("button", { name: "Retry selected (1)" }));
    const dialog = screen.getByRole("dialog", { name: "Retry 1 failed job in Incoming events" });
    expect(dialog).toBeTruthy();
    await userEvent.type(screen.getByRole("textbox", { name: /^Reason/ }), "Provider outage fixed");
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/admin/system/queues/webhooks");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ action: "retry_failed_jobs", jobIds: ["j2"] });
    expect((await screen.findByRole("status")).textContent).toContain("Retry 1 failed job in Incoming events: requested.");
    expect(screen.queryByRole("region", { name: "Failed webhooks jobs" })).toBeNull();
  } finally { vi.unstubAllGlobals(); }
});
it("shows failed-job list errors inline", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ error: "queue_unavailable" }, { status: 503 })));
  try {
    render(<SystemConsole snapshot={snapshot} />);
    await userEvent.click(screen.getByRole("button", { name: "Review failed jobs" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Queue unavailable");
  } finally { vi.unstubAllGlobals(); }
});
it("does not label an unknown queue pause state as running", () => {
  render(<SystemConsole snapshot={{ ...snapshot, queues: [{ ...snapshot.queues[0], paused: null }] }} />);
  expect(screen.queryByText("Running")).toBeNull();
  expect((screen.getByRole("button", { name: "Pause queue" }) as HTMLButtonElement).disabled).toBe(true);
});

describe("service health banner", () => {
  const normal = { ...snapshot, overall: "healthy" as const, redis: { state: "healthy" as const }, worker: { state: "healthy" as const }, stuckClaims: 0, reconciliation: { expiredDeliveryClaims: 0 }, billing: { configured: true, failedWebhooksLastHour: 0, driftedSubscriptions: 0 }, queues: [{ ...snapshot.queues[0], failed: 0, lastFailedCode: null }] };

  it("says all systems are normal, quietly, when nothing needs the owner", () => {
    render(<SystemConsole snapshot={normal} />);
    const banner = screen.getByRole("region", { name: "All systems normal" });
    expect(banner.querySelector(".status-chip.is-success")).toBeTruthy();
    expect(within(banner).queryByRole("list")).toBeNull();
    expect(within(banner).getByText("abc123")).toBeTruthy();
    expect(screen.getByText("No incidents in the last 24 hours")).toBeTruthy();
  });

  it("lists each problem with what to do and a link to where to do it, outages first", () => {
    render(<SystemConsole snapshot={snapshot} />);
    const banner = screen.getByRole("region", { name: "5 things need attention" });
    expect(banner.querySelector(".status-chip.is-danger")).toBeTruthy();
    const items = within(banner).getAllByRole("listitem");
    expect(items[0].textContent).toContain("Job queue (Redis) is down");
    expect(items[0].textContent).toContain("Probe failed. Check that Redis is running");
    expect(within(items[0]).getByRole("link").getAttribute("href")).toBe("#services");
    expect(items.map((item) => item.querySelector("strong")?.textContent)).toEqual([
      "Job queue (Redis) is down",
      "Background worker needs attention",
      "1 message send stopped without a result",
      "Razorpay billing is not set up",
      "1 billing update from Razorpay failed in the last hour",
    ]);
  });

  it("does not count routine failed jobs as a problem but highlights the number", () => {
    expect(serviceProblems(normal)).toEqual([]);
    const withFailures = { ...normal, queues: [{ ...normal.queues[0], failed: 4 }] };
    expect(serviceProblems(withFailures)).toEqual([]);
    const { container } = render(<SystemConsole snapshot={withFailures} />);
    expect(container.querySelector(".admin-queue-counts .is-failing dd")?.textContent).toBe("4");
  });

  it("puts missing settings first and collapses the ready ones into one line", () => {
    render(<SystemConsole snapshot={{ ...normal, configurationPresence: [{ requirement: "Database", present: true }, { requirement: "Owner email alerts", present: false, fix: "Set EMAIL_API_KEY." }, { requirement: "Redis", present: true }] }} />);
    const setup = document.getElementById("setup")!;
    expect(within(setup).getByText("Set EMAIL_API_KEY.")).toBeTruthy();
    const summary = within(setup).getByText("All 2 other settings ready");
    expect((summary.closest("details") as HTMLDetailsElement).open).toBe(false);
  });
});
