// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FailurePanel } from "./failure-panel";

const failure = {
  id: "f1",
  kind: "CAMPAIGN_ACTION",
  state: "FAILED" as const,
  resultCode: "PROVIDER_REJECTED",
  lastError: "Unsupported post request. Object with ID does not exist",
  attemptCount: 1,
  updatedAt: "2026-09-01T11:11:00.000Z",
};

function stubFailures(data: unknown[]) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data }) }));
}

describe("FailurePanel", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("never leaks the raw result code into the page", async () => {
    stubFailures([failure]);
    const { container } = render(<FailurePanel />);

    await screen.findByText("Campaign");
    expect(container.textContent).not.toContain("PROVIDER_REJECTED");
    expect(container.textContent).not.toContain("CAMPAIGN_ACTION");
  });

  it("leads each row with the human explanation", async () => {
    stubFailures([failure]);
    render(<FailurePanel />);

    expect(await screen.findByText(/Meta says the linked post is no longer available/)).toBeTruthy();
  });

  it("lists the failures as one bordered entry each", async () => {
    stubFailures([failure, { ...failure, id: "f2" }]);
    const { container } = render(<FailurePanel />);

    await screen.findAllByText("Campaign");
    expect(container.querySelector(".failure-list")).toBeTruthy();
    expect(container.querySelectorAll(".failure-row")).toHaveLength(2);
  });

  it("keeps the all-clear message when nothing failed", async () => {
    stubFailures([]);
    render(<FailurePanel />);

    expect(await screen.findByText(/No failed deliveries recently/)).toBeTruthy();
    // A new workspace has sent nothing, so the all-clear must not claim it did.
    expect(screen.queryByText(/Everything sent/)).toBeNull();
  });

  it("offers a retry when the failures don't load, and recovers", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Service temporarily unavailable" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [failure] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<FailurePanel />);

    expect((await screen.findByRole("alert")).textContent).toMatch(/didn’t load/);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText(/Meta says the linked post is no longer available/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
