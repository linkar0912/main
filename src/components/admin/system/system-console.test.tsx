// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"; import userEvent from "@testing-library/user-event"; import { afterEach, describe, expect, it, vi } from "vitest"; vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) })); const { SystemConsole } = await import("./system-console"); afterEach(cleanup); const snapshot = { overall: "degraded" as const, generatedAt: "2026-08-31T10:00:00.000Z", release: "abc123", web: { state: "healthy" as const }, database: { state: "healthy" as const }, redis: { state: "unavailable" as const, detail: "Probe failed" }, worker: { state: "degraded" as const, detail: "No heartbeat" }, queues: [{ name: "webhooks" as const, configured: true, paused: false, waiting: 2, active: 1, delayed: 0, completed: 20, failed: 1, oldestWaitingAgeMs: 2000, lastFailedCode: "PROVIDER_REJECTED" }], stuckClaims: 1, webhookThroughput: { lastHour: 40 }, deletionJobs: { queued: 0, running: 0, failed: 0 }, billing: { configured: false, failedWebhooksLastHour: 1, driftedSubscriptions: 0 }, incidents: [], configurationPresence: [{ requirement: "Database", present: true }], capabilities: { followGatedCampaigns: "enabled" as const }, reconciliation: { expiredDeliveryClaims: 1 }, rateLimits: { state: "healthy" as const } };
describe("SystemConsole", () => { it("labels partial outages in text rather than color alone", () => { render(<SystemConsole snapshot={snapshot} />); expect(screen.getByText(/Unavailable · Probe failed/)).toBeTruthy(); expect(screen.getByText(/degraded · No heartbeat/)).toBeTruthy(); expect(screen.getByText("Latest failure:", { exact: false })).toBeTruthy(); }); it("requires a reason dialog before pausing a queue", async () => { render(<SystemConsole snapshot={snapshot} />); await userEvent.click(screen.getByRole("button", { name: "Pause queue" })); expect(screen.getByRole("dialog", { name: "pause" })).toBeTruthy(); expect(screen.getByRole("textbox", { name: "Operator reason" })).toBeTruthy(); }); });

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
    expect(screen.getByText("Razorpay needs configuration")).toBeTruthy();
  });
});
