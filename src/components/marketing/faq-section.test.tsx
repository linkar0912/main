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

    const section = screen.getByRole("region", { name: "Questions about Instagram DM automation" });
    expect(section.id).toBe("faq");
    const triggers = within(section).getAllByRole("button");
    expect(triggers.map((trigger) => trigger.textContent)).toEqual([
      "What is Instagram automation?",
      "How do I auto-reply to Instagram comments with a DM?",
      "Is Instagram DM automation allowed?",
      "How much does Linkar cost?",
      "Which Instagram accounts can I connect?",
      "Can I send a link only to people who follow me?",
      "How does Linkar protect my account?",
      "Do I need to write code?",
      "What happens when a person should take over?",
    ]);
    expect(triggers.every((trigger) => trigger.getAttribute("aria-expanded") === "false")).toBe(true);

    const panels = within(section).getAllByRole("region", { hidden: true }).filter((panel) => panel !== section);
    expect(panels).toHaveLength(9);
    triggers.forEach((trigger, index) => {
      const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
      expect(trigger.id).toBe(`faq-trigger-${index + 1}`);
      expect(panel).toBe(panels[index]);
      expect(panel?.id).toBe(`faq-panel-${index + 1}`);
      expect(panel?.getAttribute("aria-labelledby")).toBe(trigger.id);
      expect(panel?.getAttribute("aria-hidden")).toBe("true");
    });
  });

  it("opens with a quotable 40 to 60 word definition of Instagram automation", () => {
    render(<FaqSection />);
    const trigger = screen.getByRole("button", { name: "What is Instagram automation?" });
    const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
    const answer = panel?.textContent ?? "";

    expect(trigger.id).toBe("faq-trigger-1");
    expect(answer.startsWith("Instagram automation is ")).toBe(true);
    const words = answer.trim().split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(40);
    expect(words).toBeLessThanOrEqual(60);
    expect(answer).toContain("Meta’s official Instagram API");
    expect(answer).not.toContain("\u2014");
  });

  it("answers in plain British English with the search terms people use", () => {
    render(<FaqSection />);
    const answer = (question: string) => {
      const trigger = screen.getByRole("button", { name: question });
      return document.getElementById(trigger.getAttribute("aria-controls") ?? "")?.textContent ?? "";
    };
    const all = screen.getAllByRole("button").map((trigger) => answer(trigger.textContent ?? "")).join(" ");

    // "Instagram automation tool" and "auto DM" each appear once, in context.
    expect(all.match(/Instagram automation tool/g)).toHaveLength(1);
    expect(answer("What is Instagram automation?")).toContain("Linkar is an Instagram automation tool");
    expect(all.match(/auto DM/g)).toHaveLength(1);
    expect(answer("How do I auto-reply to Instagram comments with a DM?")).toMatch(/auto DM, through a private reply\.$/);
    // Prices are rupee prices that already include GST.
    expect(answer("How much does Linkar cost?")).toMatch(/billed in rupees, GST included\.$/);
    expect(answer("How does Linkar protect my account?")).toContain("the connection you authorise");
    expect(all).not.toMatch(/\b(authoriz|recogniz|enroll)/i);
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
    const officialApi = screen.getByRole("button", { name: "Is Instagram DM automation allowed?" });

    accountSafety.focus();
    await user.keyboard("{Enter}");
    expect(accountSafety.getAttribute("aria-expanded")).toBe("true");

    officialApi.focus();
    await user.keyboard(" ");
    expect(officialApi.getAttribute("aria-expanded")).toBe("true");

    expect(document.getElementById(accountSafety.getAttribute("aria-controls") ?? "")?.textContent).toContain("keeps each workspace’s data scoped");
    expect(document.getElementById(officialApi.getAttribute("aria-controls") ?? "")?.textContent).toContain("official Instagram API");
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
    const section = screen.getByRole("region", { name: "Questions about Instagram DM automation" });
    const trigger = screen.getByRole("button", { name: "Do I need to write code?" });

    fireEvent.click(trigger);
    expect(section.getAttribute("data-reduced-motion-state")).toBe("immediate");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(trigger.getAttribute("aria-controls") ?? "")?.getAttribute("aria-hidden")).toBe("false");
  });
});
