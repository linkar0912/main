// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScreenSkeleton } from "./skeleton";

describe("ScreenSkeleton", () => {
  afterEach(cleanup);

  it("keeps the mobile drawer closed and renders a mobile topbar", () => {
    const { container } = render(<ScreenSkeleton />);

    expect(container.querySelector(".sidebar")?.getAttribute("data-open")).toBe("false");
    expect(screen.getByLabelText("Loading workspace navigation")).toBeTruthy();
  });
});
