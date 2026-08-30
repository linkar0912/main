// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OAuthButtons } from "./oauth-buttons";

afterEach(cleanup);

describe("OAuthButtons", () => {
  it("renders a Google and a Facebook continue link, each pointing at its own provider route", () => {
    render(<OAuthButtons next="/dashboard" />);

    const google = screen.getByRole("link", { name: /continue with google/i });
    const facebook = screen.getByRole("link", { name: /continue with facebook/i });

    expect(google.getAttribute("href")).toBe("/api/auth/oauth/google/start?next=%2Fdashboard");
    expect(facebook.getAttribute("href")).toBe("/api/auth/oauth/facebook?next=%2Fdashboard");
  });

  it("carries the next path through both links as a query param", () => {
    render(<OAuthButtons next="/automations" />);

    for (const link of screen.getAllByRole("link")) {
      const href = new URL(link.getAttribute("href")!, "http://localhost");
      expect(href.searchParams.get("next")).toBe("/automations");
    }
  });

  it("carries an invite token through both links when provided", () => {
    render(<OAuthButtons next="/dashboard" invite="invite-token-123" />);

    for (const link of screen.getAllByRole("link")) {
      const href = new URL(link.getAttribute("href")!, "http://localhost");
      expect(href.searchParams.get("invite")).toBe("invite-token-123");
    }
  });

  it("omits the invite param entirely when no invite is given", () => {
    render(<OAuthButtons next="/dashboard" />);

    for (const link of screen.getAllByRole("link")) {
      const href = new URL(link.getAttribute("href")!, "http://localhost");
      expect(href.searchParams.has("invite")).toBe(false);
    }
  });
});
