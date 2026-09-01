// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryDiagnostics } from "./delivery-diagnostics";

describe("DeliveryDiagnostics", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows ambiguous and retryable delivery problems", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [
      { kind: "LEAD_WEBHOOK", state: "UNKNOWN", attemptCount: 1, lastError: "socket closed", updatedAt: "2026-08-23T12:00:00.000Z" },
      { kind: "BROADCAST_RECIPIENT", state: "FAILED", attemptCount: 2, lastError: "Meta 429", updatedAt: "2026-08-23T12:01:00.000Z" },
    ] }) }));
    render(<DeliveryDiagnostics />);
    expect(await screen.findByText("Needs review")).toBeTruthy();
    expect(screen.getByText("Retry pending")).toBeTruthy();
    expect(screen.getByText("socket closed")).toBeTruthy();
  });

  it("shares the failure row markup instead of borrowing the sequence status pill", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [
      { kind: "CAMPAIGN_ACTION", state: "FAILED", attemptCount: 1, lastError: "Meta 429", updatedAt: "2026-08-23T12:01:00.000Z" },
    ] }) }));
    const { container } = render(<DeliveryDiagnostics />);

    const pill = await screen.findByText("Retry pending");
    // .sequence-status is the Sequences screen's pill; reusing it here meant
    // this warning inherited that component's neutral slate fill.
    expect(pill.className).not.toContain("sequence-status");
    expect(pill.className).toContain("failure-state");
    expect(container.querySelector(".failure-list")).toBeTruthy();
    expect(container.querySelectorAll(".failure-row")).toHaveLength(1);
  });

  it("does not render an empty panel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }));
    const { container } = render(<DeliveryDiagnostics />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });
});
