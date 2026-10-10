// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react"; import userEvent from "@testing-library/user-event"; import { afterEach, describe, expect, it, vi } from "vitest"; vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) })); const { SystemConsole } = await import("./system-console"); afterEach(cleanup); const snapshot = { overall: "degraded" as const, generatedAt: "2026-08-31T10:00:00.000Z", release: "abc123", web: { state: "healthy" as const }, database: { state: "healthy" as const }, redis: { state: "unavailable" as const, detail: "Probe failed" }, worker: { state: "degraded" as const, detail: "No heartbeat" }, queues: [{ name: "webhooks" as const, configured: true, paused: false, waiting: 2, active: 1, delayed: 0, completed: 20, failed: 1, oldestWaitingAgeMs: 2000, lastFailedCode: "PROVIDER_REJECTED" }], stuckClaims: 1, webhookThroughput: { lastHour: 40 }, deletionJobs: { queued: 0, running: 0, failed: 0 }, billing: { configured: false, failedWebhooksLastHour: 1, driftedSubscriptions: 0 }, incidents: [], configurationPresence: [{ requirement: "Database", present: true }], capabilities: { followGatedCampaigns: "enabled" as const }, reconciliation: { expiredDeliveryClaims: 1 }, rateLimits: { state: "healthy" as const } };
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
    expect(screen.getByText("1 active incident")).toBeTruthy();
  });

  it("shows a calm empty incident state and explicit billing readiness", () => {
    render(<SystemConsole snapshot={snapshot} />);
    expect(screen.getByText("No incidents in the last 24 hours")).toBeTruthy();
    expect(screen.getByText(/Razorpay billing is not set up/)).toBeTruthy();
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
