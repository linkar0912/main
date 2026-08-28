// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowGallery } from "./workflow-gallery";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WorkflowGallery", () => {
  it("renders the exact ordered Linkar workflow examples with the first tab selected", () => {
    render(<WorkflowGallery />);

    const section = screen.getByRole("region", { name: "Build the path your audience actually needs." });
    expect(section.id).toBe("workflows");
    expect(within(section).getByText("Start with a real moment, then decide what Linkar should remember, send, or hand back.")).toBeTruthy();

    const tablist = within(section).getByRole("tablist", { name: "Workflow examples" });
    expect(tablist.getAttribute("aria-orientation")).toBe("vertical");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "Guide delivery",
      "Lead qualifier",
      "Timed nurture",
      "Human handoff",
    ]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs.slice(1).every((tab) => tab.getAttribute("aria-selected") === "false")).toBe(true);

    const panels = within(section).getAllByRole("tabpanel", { hidden: true });
    expect(panels).toHaveLength(4);
    tabs.forEach((tab, index) => {
      const controlledPanel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
      expect(controlledPanel).toBe(panels[index]);
      expect(controlledPanel?.getAttribute("aria-labelledby")).toBe(tab.id);
      expect(controlledPanel?.hidden).toBe(index !== 0);
    });

    const panel = within(section).getByRole("tabpanel");
    expect(within(panel).getByText("Keyword trigger")).toBeTruthy();
    expect(within(panel).getByText("Send guide")).toBeTruthy();
    expect(within(panel).getByText("Ask goal")).toBeTruthy();
    expect(within(panel).getByText("Flow canvas")).toBeTruthy();
    expect(within(panel).getByText("Live logic")).toBeTruthy();
    expect(panel.querySelector("svg path")).toBeTruthy();
  });

  it("changes the selected preview on a real click", () => {
    render(<WorkflowGallery />);

    const priceList = screen.getByRole("tab", { name: "Guide delivery" });
    fireEvent.click(screen.getByRole("tab", { name: "Timed nurture" }));

    expect(priceList.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "Timed nurture" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("Reply received");
    expect(screen.getByRole("tabpanel").textContent).toContain("Wait 18 hours");
    expect(screen.getByRole("tabpanel").textContent).toContain("Send check-in");
    expect(screen.getByRole("tabpanel").textContent).not.toContain("Send guide");
  });

  it("uses vertical tab keyboard behavior with wrapping and keeps focus on the selected tab", () => {
    render(<WorkflowGallery />);

    const guide = screen.getByRole("tab", { name: "Guide delivery" });
    guide.focus();
    fireEvent.keyDown(guide, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Human handoff" }));
    expect(screen.getByRole("tab", { name: "Human handoff" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Guide delivery" }));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Lead qualifier" }));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Guide delivery" }));

    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Human handoff" }));

    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Guide delivery" }));
  });

  it("provides one-open accordion controls and matching details for mobile presentation", () => {
    render(<WorkflowGallery />);

    const accordion = screen.getByLabelText("Workflow examples on mobile");
    const guide = within(accordion).getByRole("button", { name: "Guide delivery" });
    const lead = within(accordion).getByRole("button", { name: "Lead qualifier" });
    expect(guide.getAttribute("aria-expanded")).toBe("true");
    expect(lead.getAttribute("aria-expanded")).toBe("false");
    expect(guide.getAttribute("aria-controls")).toBeTruthy();
    within(accordion).getAllByRole("button").forEach((trigger, index) => {
      const controlledPanel = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
      expect(trigger.id).toBeTruthy();
      expect(controlledPanel?.getAttribute("aria-labelledby")).toBe(trigger.id);
      expect(controlledPanel?.hidden).toBe(index !== 0);
    });

    fireEvent.click(lead);
    expect(guide.getAttribute("aria-expanded")).toBe("false");
    expect(lead.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(lead.getAttribute("aria-controls") ?? "")?.textContent).toContain("Save answer");

    fireEvent.click(lead);
    expect(lead.getAttribute("aria-expanded")).toBe("true");
  });

  it("replaces the active panel immediately without outgoing residue when reduced motion is preferred", () => {
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
    render(<WorkflowGallery />);

    const section = screen.getByRole("region", { name: "Build the path your audience actually needs." });
    expect(section.getAttribute("data-reduced-motion-state")).toBe("visible");
    fireEvent.click(screen.getByRole("tab", { name: "Lead qualifier" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("Save answer");
    const exposedPanels = screen.getAllByRole("tabpanel");
    expect(exposedPanels).toHaveLength(1);
    expect(exposedPanels[0].textContent).not.toContain("Send guide");
    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(4);
    expect(section.querySelector("[data-transition-state='leaving']")).toBeNull();
  });

  it("keeps the contract's desktop, tablet, mobile, and motion values in the local stylesheet", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "src/components/marketing/workflow-gallery.module.css"), "utf8");

    expect(stylesheet).toContain("padding: clamp(120px, 11vw, 176px) clamp(32px, 4.45vw, 72px);");
    expect(stylesheet).toContain("grid-column: 1 / span 4;");
    expect(stylesheet).toContain("grid-column: 5 / -1;");
    expect(stylesheet).toContain("min-block-size: 600px;");
    expect(stylesheet).toContain("@media (min-width: 768px) and (max-width: 1023px)");
    expect(stylesheet).toContain("grid-template-columns: 280px minmax(0, 1fr);");
    expect(stylesheet).toContain("min-block-size: 520px;");
    expect(stylesheet).toContain("@media (max-width: 767px)");
    expect(stylesheet).toContain("padding: 88px 20px;");
    expect(stylesheet).toContain("min-block-size: 76px;");
    expect(stylesheet).toContain("min-block-size: 360px;");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
