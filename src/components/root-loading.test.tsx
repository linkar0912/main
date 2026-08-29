// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Loading from "../../app/loading";

describe("root loading fallback", () => {
  afterEach(cleanup);

  it("uses a route-neutral loading screen instead of a workspace sidebar", () => {
    render(<Loading />);

    expect(screen.queryByLabelText("Workspace sidebar")).toBeNull();
    // Splash renders only the Linkar wordmark (matching the app header) with a
    // gentle pulse — no spinner, no "Loading Linkar" subtext, no logo icon.
    expect(screen.getByText("Linkar")).toBeTruthy();
    expect(screen.queryByText("Loading Linkar")).toBeNull();
    expect(document.querySelector(".loading-spinner")).toBeNull();
    expect(document.querySelector(".root-loading-logo")).toBeTruthy();
  });
});
