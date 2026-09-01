// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyDiagnosticsButton } from "./copy-diagnostics-button";

describe("CopyDiagnosticsButton", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("combines the three support sources and copies safe JSON", async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: clipboardWrite }, configurable: true });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/meta/connection/health") return new Response(JSON.stringify({ data: [{ id: "ig_1", status: "CONNECTED", subscribedFields: ["comments"], missingFields: ["messages"] }] }));
      if (url === "/api/facebook/connection/health") return new Response(JSON.stringify({ data: [{ id: "fb_1", status: "CONNECTED", subscribedFields: ["feed"], missingFields: [] }] }));
      if (url === "/api/insights/failures") return new Response(JSON.stringify({ data: [{ id: "failure_1", kind: "FLOW_FOLLOWUP", resultCode: "PROVIDER_REJECTED", attemptCount: 1, updatedAt: "2026-09-01T06:00:00.000Z", lastError: "private" }] }));
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CopyDiagnosticsButton />);

    fireEvent.click(screen.getByRole("button", { name: "Copy diagnostics" }));

    await waitFor(() => expect(screen.getByText("Diagnostics copied.")).toBeTruthy());
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "/api/meta/connection/health",
      "/api/facebook/connection/health",
      "/api/insights/failures",
    ]);
    expect(clipboardWrite).toHaveBeenCalledTimes(1);
    const copied = String(clipboardWrite.mock.calls[0][0]);
    expect(copied).toContain("failure_1");
    expect(copied).not.toContain("private");
  });
});
