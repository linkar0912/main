import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dispatchPendingIncidentAlerts } = await import("./alerts");

describe("incident alert dispatch", () => {
  it("emails every owner once and marks an active incident notified", async () => {
    const send = vi.fn().mockResolvedValue({ delivered: true, id: "email_1" });
    const repository = {
      listPending: vi.fn().mockResolvedValue([{
        id: "i_1", status: "OPEN", severity: "CRITICAL", title: "Database unavailable",
        detail: "The bounded health probe did not succeed.", source: "component:database",
        firstSeenAt: new Date("2026-09-05T06:00:00Z"), resolvedAt: null,
      }]),
      markNotificationSent: vi.fn().mockResolvedValue(undefined),
      markRecoverySent: vi.fn().mockResolvedValue(undefined),
    };

    await expect(dispatchPendingIncidentAlerts({
      recipients: ["owner@linkar.in", "ops@linkar.in"], repository, send,
      now: new Date("2026-09-05T06:05:00Z"), adminUrl: "https://admin.linkar.in",
    })).resolves.toEqual({ attempted: 1, delivered: 1 });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      subject: "[Linkar critical] Database unavailable",
      idempotencyKey: "incident:i_1:open:critical:owner@linkar.in",
    }));
    expect(repository.markNotificationSent).toHaveBeenCalledWith("i_1", expect.any(Date));
  });

  it("keeps an incident pending unless every recipient receives the alert", async () => {
    const repository = {
      listPending: vi.fn().mockResolvedValue([{
        id: "i_2", status: "RESOLVED", severity: "WARNING", title: "Queue paused",
        detail: "Queue processing is paused.", source: "queue:webhooks",
        firstSeenAt: new Date("2026-09-05T06:00:00Z"), resolvedAt: new Date("2026-09-05T06:03:00Z"),
      }]),
      markNotificationSent: vi.fn(),
      markRecoverySent: vi.fn(),
    };
    const send = vi.fn()
      .mockResolvedValueOnce({ delivered: true, id: "email_1" })
      .mockResolvedValueOnce({ delivered: false, reason: "provider_error" });

    await dispatchPendingIncidentAlerts({
      recipients: ["owner@linkar.in", "ops@linkar.in"], repository, send,
      now: new Date("2026-09-05T06:05:00Z"), adminUrl: "https://admin.linkar.in",
    });
    expect(repository.markRecoverySent).not.toHaveBeenCalled();
  });
});
