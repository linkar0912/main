// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Loading from "../../app/loading";

describe("root loading fallback", () => {
  afterEach(cleanup);

  it("uses a route-neutral loading screen instead of a workspace sidebar", () => {
    render(<Loading />);

    expect(screen.queryByLabelText("Workspace sidebar")).toBeNull();
    expect(screen.getByText("Loading Linkar")).toBeTruthy();
  });
});
