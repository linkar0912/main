// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IdChip, shortId } from "./id-chip";
import { fullTimeLabel, RelativeTime, relativeTimeLabel } from "./relative-time";
import { StatusBadge } from "./status-badge";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Built from local fields so the expectations hold in every time zone.
const now = new Date(2026, 9, 11, 21, 30, 0).getTime();
const at = (day: number, hour: number, minute = 0, year = 2026, month = 9) => new Date(year, month, day, hour, minute);

describe("shortId", () => {
  it("drops the type prefix and keeps the first 8 and last 4 characters", () => {
    expect(shortId("workspace_9f30c8c8-a723-4c1e-b0d4-1e2f3a4b633c")).toBe("9f30c8c8…633c");
    expect(shortId("admin_req_7a1b2c3d4e5f6a7b8c9d")).toBe("7a1b2c3d…8c9d");
  });

  it("shortens a commit SHA to seven characters and leaves short IDs alone", () => {
    expect(shortId("e4afaee1c0ffee1234567890abcdef1234567890")).toBe("e4afaee");
    expect(shortId("user-1")).toBe("user-1");
    expect(shortId("e4afaee")).toBe("e4afaee");
  });
});

describe("IdChip", () => {
  it("shows the short form, keeps the full ID in the tooltip, and copies the full ID", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<IdChip id="workspace_9f30c8c8-a723-4c1e-b0d4-1e2f3a4b633c" prefix="ID" />);
    expect(screen.getByText("9f30c8c8…633c")).toBeTruthy();
    expect(screen.getByTitle("workspace_9f30c8c8-a723-4c1e-b0d4-1e2f3a4b633c")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy id" }));
    expect(writeText).toHaveBeenCalledWith("workspace_9f30c8c8-a723-4c1e-b0d4-1e2f3a4b633c");
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied id" })).toBeTruthy());
  });
});

describe("relativeTimeLabel", () => {
  it("reads past times the way a person says them", () => {
    expect(relativeTimeLabel(now - 20_000, now)).toBe("Just now");
    expect(relativeTimeLabel(now - 60_000, now)).toBe("1 minute ago");
    expect(relativeTimeLabel(now - 12 * 60_000, now)).toBe("12 minutes ago");
    expect(relativeTimeLabel(now - 2 * 3_600_000, now)).toBe("2 hours ago");
    expect(relativeTimeLabel(at(10, 21, 19), now)).toBe("Yesterday 21:19");
    expect(relativeTimeLabel(at(7, 9, 5), now)).toMatch(/^[A-Z][a-z]{2} 09:05$/);
    expect(relativeTimeLabel(at(3, 21, 19), now)).toBe("3 Oct, 21:19");
    expect(relativeTimeLabel(at(3, 9, 0, 2025), now)).toBe("3 Oct 2025");
  });

  it("reads future times as upcoming", () => {
    expect(relativeTimeLabel(now + 20 * 60_000, now)).toBe("in 20 minutes");
    expect(relativeTimeLabel(at(12, 10, 0), now)).toBe("Tomorrow 10:00");
  });

  it("never prints UTC", () => {
    expect(fullTimeLabel(now)).not.toContain("UTC");
  });
});

describe("RelativeTime", () => {
  it("renders the relative label with the full local time in the tooltip", () => {
    render(<RelativeTime value={new Date(Date.now() - 3 * 60_000).toISOString()} />);
    const time = screen.getByText(/minutes ago/);
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("title")).toBeTruthy();
  });

  it("uses a plain fallback when there is no time", () => {
    render(<RelativeTime value={null} fallback="Not set" />);
    expect(screen.getByText("Not set")).toBeTruthy();
  });
});

describe("StatusBadge", () => {
  it("pairs a dot with a plain word", () => {
    render(<StatusBadge tone="warning" label="Needs attention" />);
    const badge = screen.getByText("Needs attention");
    expect(badge.className).toContain("status-chip is-warning");
    expect(badge.querySelector(".status-chip-dot")).toBeTruthy();
  });
});
