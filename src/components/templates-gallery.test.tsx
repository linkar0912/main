// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { basicAutomationTemplates } from "@/src/lib/automation/templates";
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
    expect(screen.getByText(/Email Capture:/)).toBeTruthy();
    expect(screen.getByText(/Default Reply:/)).toBeTruthy();
    expect(screen.getByText(/Main Menu:/)).toBeTruthy();
  });

  it("links every recipe into the builder with its template id", () => {
    render(<TemplatesGallery />);

    const setUpLinks = screen.getAllByRole("link", { name: "Set Up" });
    expect(setUpLinks.map((link) => link.getAttribute("href"))).toEqual(
      basicAutomationTemplates.map((template) => `/automations/new?type=classic&template=${template.id}`),
    );
  });

  it("ships nothing as BETA or unavailable", () => {
    render(<TemplatesGallery />);

    expect(screen.queryByText("BETA")).toBeNull();
    expect(screen.queryByText(/Unavailable for now\./)).toBeNull();
    expect(screen.queryByRole("link", { name: "Learn more" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Set Up" }).length).toBe(basicAutomationTemplates.length);
  });
});
