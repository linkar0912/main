// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FaqSection } from "./faq-section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FaqSection", () => {
  it("renders exact questions as initially-collapsed reciprocal button and region pairs", () => {
    render(<FaqSection />);

    const section = screen.getByRole("region", { name: "Good questions before you switch anything on." });
    expect(section.id).toBe("faq");
    const triggers = within(section).getAllByRole("button");
    expect(triggers.map((trigger) => trigger.textContent)).toEqual([
      "How does Linkar protect my account?",
      "Does Linkar use the official API?",
      "Do I need to write code?",
      "What happens when a person should take over?",
    ]);
    expect(triggers.every((trigger) => trigger.getAttribute("aria-expanded") === "false")).toBe(true);

    const panels = within(section).getAllByRole("region", { hidden: true }).filter((panel) => panel !== section);
    expect(panels).toHaveLength(4);
    triggers.forEach((trigger, index) => {
      const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
      expect(trigger.id).toBe(`faq-trigger-${index + 1}`);
      expect(panel).toBe(panels[index]);
      expect(panel?.id).toBe(`faq-panel-${index + 1}`);
      expect(panel?.getAttribute("aria-labelledby")).toBe(trigger.id);
      expect(panel?.getAttribute("aria-hidden")).toBe("true");
    });
  });

  it("toggles the account-safety answer and keeps focus on its native trigger", () => {
    render(<FaqSection />);
    const trigger = screen.getByRole("button", { name: "How does Linkar protect my account?" });
    const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "");

    trigger.focus();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(trigger);
    expect(panel?.getAttribute("aria-hidden")).toBe("false");
    expect(panel?.textContent).toContain("encrypts stored access tokens");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    expect(panel?.getAttribute("aria-hidden")).toBe("true");
  });

  it("allows multiple answers to stay expanded through native Enter and Space activation", async () => {
    const user = userEvent.setup();
    render(<FaqSection />);
    const accountSafety = screen.getByRole("button", { name: "How does Linkar protect my account?" });
    const officialApi = screen.getByRole("button", { name: "Does Linkar use the official API?" });

    accountSafety.focus();
    await user.keyboard("{Enter}");
    expect(accountSafety.getAttribute("aria-expanded")).toBe("true");

    officialApi.focus();
    await user.keyboard(" ");
    expect(officialApi.getAttribute("aria-expanded")).toBe("true");

    expect(document.getElementById(accountSafety.getAttribute("aria-controls") ?? "")?.textContent).toContain("keeps each workspace’s data scoped");
    expect(document.getElementById(officialApi.getAttribute("aria-controls") ?? "")?.textContent).toContain("official API");
  });

  it("keeps state changes immediate under reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    render(<FaqSection />);
    const section = screen.getByRole("region", { name: "Good questions before you switch anything on." });
    const trigger = screen.getByRole("button", { name: "Do I need to write code?" });

    fireEvent.click(trigger);
    expect(section.getAttribute("data-reduced-motion-state")).toBe("immediate");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(trigger.getAttribute("aria-controls") ?? "")?.getAttribute("aria-hidden")).toBe("false");
  });
});
