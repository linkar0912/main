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

  it("does not render an empty panel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }));
    const { container } = render(<DeliveryDiagnostics />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });
});
