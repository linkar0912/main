// @vitest-environment jsdom
import { existsSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import WorkspaceLoading from "../../app/(app)/loading";
import OnboardingLoading from "../../app/onboarding/loading";

describe("route loading fallbacks", () => {
  afterEach(cleanup);

  it("has no loading boundary at the app root, so public pages are not streamed behind a splash", () => {
    // A loading file at the root wraps every route: the marketing pages then
    // sent the splash first and their content in a hidden streamed segment.
    for (const extension of ["tsx", "ts", "jsx", "js"]) {
      expect(existsSync(path.join(process.cwd(), `app/loading.${extension}`))).toBe(false);
    }
  });

  it("shows a content-area skeleton inside the signed-in shell, without a second sidebar or main landmark", () => {
    const { container } = render(<WorkspaceLoading />);

    expect(screen.queryByLabelText("Workspace sidebar")).toBeNull();
    expect(container.querySelector(".app-frame, .sidebar, .mobile-topbar")).toBeNull();
    // The (app) layout already renders <main id="main-content"> around it.
    expect(container.querySelector("main")).toBeNull();
    expect(screen.getByRole("region", { name: "Loading workspace" }).getAttribute("aria-busy")).toBe("true");
  });

  it("keeps the route-neutral wordmark splash for the full-screen onboarding page", () => {
    render(<OnboardingLoading />);

    expect(screen.queryByLabelText("Workspace sidebar")).toBeNull();
    // Splash renders only the Linkar wordmark (matching the app header) with a
    // gentle pulse - no spinner, no "Loading Linkar" subtext, no logo icon.
    expect(screen.getByText("Linkar")).toBeTruthy();
    expect(screen.queryByText("Loading Linkar")).toBeNull();
    expect(document.querySelector(".loading-spinner")).toBeNull();
    expect(document.querySelector(".root-loading-logo")).toBeTruthy();
  });
});
