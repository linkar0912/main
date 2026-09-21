// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelShowcase } from "./channel-showcase";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChannelShowcase", () => {
  it("presents both channels without decorative sequence numbers", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<ChannelShowcase />);

    const section = screen.getByRole("region", { name: "Everywhere your audience is" });
    expect(within(section).getByRole("heading", { name: "Instagram" })).toBeTruthy();
    expect(within(section).getByRole("heading", { name: "Facebook Pages" })).toBeTruthy();
    expect(within(section).queryAllByText(/^0[12]$/)).toHaveLength(0);
  });
});
