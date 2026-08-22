// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TemplatesGallery } from "./templates-gallery";

describe("TemplatesGallery", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the Automation heading and every premade card", () => {
    render(<TemplatesGallery />);

    expect(screen.getByRole("heading", { name: "Automation" })).toBeTruthy();
    expect(screen.getByText(/Say hi to new followers:/)).toBeTruthy();
    expect(screen.getByText(/Conversation Starters:/)).toBeTruthy();
    expect(screen.getByText(/Story Mention Reply:/)).toBeTruthy();
    expect(screen.getByText(/Default Reply:/)).toBeTruthy();
    expect(screen.getByText(/Main Menu:/)).toBeTruthy();
  });

  it("links exactly the available recipes into the builder with their template id", () => {
    render(<TemplatesGallery />);

    const setUpLinks = screen.getAllByRole("link", { name: "Set Up" });
    expect(setUpLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/automations/new?type=classic&template=conversation-starters",
      "/automations/new?type=classic&template=default-reply",
      "/automations/new?type=classic&template=main-menu",
    ]);
  });

  it("marks unavailable recipes without a Set Up button", () => {
    render(<TemplatesGallery />);

    expect(screen.getAllByText(/Unavailable for now\./).length).toBe(2);
    expect(screen.getAllByRole("link", { name: "Learn more" }).length).toBe(2);
    expect(screen.getByText("BETA")).toBeTruthy();
  });
});
