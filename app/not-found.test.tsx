// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import NotFound, { metadata } from "./not-found";

afterEach(cleanup);

describe("404 page", () => {
  it("says what happened in one sentence and offers two ways forward", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the home page" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Get help" }).getAttribute("href")).toBe("/support");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
