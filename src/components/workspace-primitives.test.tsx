// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocalIdChip, LocalStatusBadge, lifecycleStatus, relativeTimeLabel, shortId } from "./workspace-primitives";

afterEach(cleanup);

describe("relativeTimeLabel", () => {
  const now = new Date(2026, 9, 11, 15, 0).getTime();

  it("reads recent times as plain phrases", () => {
    expect(relativeTimeLabel(new Date(now - 20_000), now)).toBe("Just now");
    expect(relativeTimeLabel(new Date(now - 5 * 60_000), now)).toBe("5 minutes ago");
    expect(relativeTimeLabel(new Date(now - 60_000), now)).toBe("1 minute ago");
    expect(relativeTimeLabel(new Date(now - 3 * 3_600_000), now)).toBe("3 hours ago");
  });

  it("names yesterday with a clock time and older days by count, then by date", () => {
    expect(relativeTimeLabel(new Date(2026, 9, 10, 21, 19), now)).toMatch(/^Yesterday, 9:19\s?pm$/i);
    expect(relativeTimeLabel(new Date(2026, 9, 7, 12, 0), now)).toBe("4 days ago");
    expect(relativeTimeLabel(new Date(2026, 8, 1, 12, 0), now)).toBe("1 Sept 2026");
  });

  it("handles future times", () => {
    expect(relativeTimeLabel(new Date(now + 2 * 3_600_000), now)).toBe("In 2 hours");
    expect(relativeTimeLabel(new Date(2026, 9, 14, 12, 0), now)).toBe("In 3 days");
  });
});

describe("shortId and LocalIdChip", () => {
  it("strips the type prefix and keeps first 8 + last 4", () => {
    expect(shortId("workspace_9f30c8c8-a723-4c1b-9d2e-5f61a8b2633c")).toBe("9f30c8c8…633c");
    expect(shortId("reel_launch")).toBe("reel_launch");
  });

  it("keeps the full ID on hover and offers a copy button", () => {
    render(<LocalIdChip id="automation_6c67ab12-0000-4000-8000-00000000f3e9" />);
    expect(screen.getByTitle("automation_6c67ab12-0000-4000-8000-00000000f3e9")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy ID" })).toBeTruthy();
  });
});

describe("LocalStatusBadge", () => {
  it("renders a dot and a plain word", () => {
    const { container } = render(<LocalStatusBadge {...lifecycleStatus("PAUSED")} />);
    expect(screen.getByText("Paused")).toBeTruthy();
    expect(container.querySelector(".status-chip")?.classList.contains("is-warning")).toBe(true);
  });
});
