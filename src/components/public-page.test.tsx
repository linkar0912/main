// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicPage } from "./public-page";

describe("PublicPage", () => {
  it("returns people to the gated dashboard", () => {
    render(<PublicPage title="Privacy" intro="How Linkar handles your data."><p>Policy content</p></PublicPage>);

    expect(screen.getByRole("link", { name: /back to app/i }).getAttribute("href")).toBe("/dashboard");
  });
});
