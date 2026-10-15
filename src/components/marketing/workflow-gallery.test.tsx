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

    const section = screen.getByRole("region", { name: "Ready-made Instagram DM automation workflows." });
    expect(section.id).toBe("workflows");
    expect(within(section).getByText("Start with a real customer moment, then choose what Linkar should ask, send, remember, or pass to your team.")).toBeTruthy();

    const tablist = within(section).getByRole("tablist", { name: "Workflow examples" });
    expect(tablist.getAttribute("aria-orientation")).toBe("vertical");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "Send a free guide",
      "Ask what someone needs",
      "Follow up later",
      "Let your team take over",
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
    expect(within(panel).getByText("Someone comments GUIDE")).toBeTruthy();
    expect(within(panel).getByText("Send the guide")).toBeTruthy();
    expect(within(panel).getByText("Ask what they need")).toBeTruthy();
    expect(within(panel).getByText("Reply plan")).toBeTruthy();
    expect(within(panel).getByText("Ready to run")).toBeTruthy();
    expect(panel.querySelector("svg path")).toBeTruthy();
  });

  it("links each workflow to the ready-made recipe it is built from", () => {
    render(<WorkflowGallery />);
    const expected = [
      ["Instagram comment to guide template", "/templates/comment-guide-delivery"],
      ["Instagram lead qualification template", "/templates/lead-qualification"],
      ["Instagram offer follow-up template", "/templates/offer-follow-up"],
      ["Instagram support handoff template", "/templates/support-handoff"],
    ];

    // Desktop: one link inside each tab panel, under its preview.
    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    expect(panels.map((panel) => {
      const links = Array.from(panel.querySelectorAll("a"));
      expect(links).toHaveLength(1);
      return [links[0].textContent?.replace("→", "").trim(), links[0].getAttribute("href")];
    })).toEqual(expected);
    // Only the open panel's link is exposed, and its name is the template alone.
    expect(within(screen.getByRole("tabpanel")).getByRole("link", { name: "Instagram comment to guide template" })
      .getAttribute("href")).toBe("/templates/comment-guide-delivery");

    // Mobile: the same link closes each accordion panel.
    const accordion = screen.getByLabelText("Workflow examples on mobile");
    const mobilePanels = Array.from(accordion.querySelectorAll('[id^="workflow-mobile-panel-"]'));
    expect(mobilePanels.map((panel) => {
      const link = panel.querySelector("a");
      return [link?.textContent?.replace("→", "").trim(), link?.getAttribute("href")];
    })).toEqual(expected);
  });

  it("keeps the leaving copy free of links while two panels cross", () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    render(<WorkflowGallery />);

    fireEvent.click(screen.getByRole("tab", { name: "Follow up later" }));
    const leaving = document.querySelector("[data-transition-state='leaving']");
    expect(leaving?.getAttribute("aria-hidden")).toBe("true");
    // It still draws the template line, so both panels keep the same height.
    expect(leaving?.textContent).toContain("Instagram comment to guide template");
    expect(leaving?.querySelectorAll("a, button, [tabindex]")).toHaveLength(0);
    expect(within(screen.getByRole("tabpanel")).getByRole("link", { name: "Instagram offer follow-up template" })).toBeTruthy();
  });

  it("changes the selected preview on a real click", () => {
    render(<WorkflowGallery />);

    const priceList = screen.getByRole("tab", { name: "Send a free guide" });
    fireEvent.click(screen.getByRole("tab", { name: "Follow up later" }));

    expect(priceList.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "Follow up later" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("Someone replies");
    expect(screen.getByRole("tabpanel").textContent).toContain("Wait 18 hours");
    expect(screen.getByRole("tabpanel").textContent).toContain("Send a reminder");
    expect(screen.getByRole("tabpanel").textContent).not.toContain("Send the guide");
  });

  it("uses vertical tab keyboard behavior with wrapping and keeps focus on the selected tab", () => {
    render(<WorkflowGallery />);

    const guide = screen.getByRole("tab", { name: "Send a free guide" });
    guide.focus();
    fireEvent.keyDown(guide, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Let your team take over" }));
    expect(screen.getByRole("tab", { name: "Let your team take over" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Send a free guide" }));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Ask what someone needs" }));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Send a free guide" }));

    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Let your team take over" }));

    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Send a free guide" }));
  });

  it("provides one-open accordion controls and matching details for mobile presentation", () => {
    render(<WorkflowGallery />);

    const accordion = screen.getByLabelText("Workflow examples on mobile");
    const guide = within(accordion).getByRole("button", { name: "Send a free guide" });
    const lead = within(accordion).getByRole("button", { name: "Ask what someone needs" });
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
    expect(document.getElementById(lead.getAttribute("aria-controls") ?? "")?.textContent).toContain("Save the answer");

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

    const section = screen.getByRole("region", { name: "Ready-made Instagram DM automation workflows." });
    expect(section.getAttribute("data-reduced-motion-state")).toBe("visible");
    fireEvent.click(screen.getByRole("tab", { name: "Ask what someone needs" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("Save the answer");
    const exposedPanels = screen.getAllByRole("tabpanel");
    expect(exposedPanels).toHaveLength(1);
    expect(exposedPanels[0].textContent).not.toContain("Send the guide");
    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(4);
    expect(section.querySelector("[data-transition-state='leaving']")).toBeNull();
  });

  it("connects the step rail between markers and keeps the last card off the footer rule", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "src/components/marketing/workflow-gallery.module.css"), "utf8");

    // Each segment runs from its own marker's centre to the next marker's top
    // edge, so both ends finish behind an opaque marker. A single spine down the
    // whole column cannot know where the last marker's centre is - the final row
    // is only as tall as its card - and left a dashed tail hanging past it.
    expect(stylesheet).toContain('.step:not(:last-child) .stepRail::after');
    expect(stylesheet).toContain("inset-block: calc(var(--rail-marker) / 2) 0;");
    expect(stylesheet).toMatch(/\.stepMarker \{[^}]*z-index: 1;/);
    // The rail geometry is derived from the marker size, so the mobile override
    // only has to restate the two custom properties.
    expect(stylesheet).toContain("--rail-column: 28px; --rail-marker: 26px;");

    // The panels are absolutely stacked, so nothing stops a too-tall body from
    // painting across the footer's border. Trailing card margin is dropped,
    // there is padding above the rule, and `safe center` plus overflow:hidden
    // make a future overflow clip instead of overlap.
    expect(stylesheet).toContain(".step:last-child .stepCard {");
    expect(stylesheet).toMatch(/\.builderBody \{[\s\S]*?align-content: safe center;[\s\S]*?padding-block-end: 10px;[\s\S]*?overflow: hidden;[\s\S]*?\}/);
  });

  it("keeps the contract's desktop, tablet, mobile, and motion values in the local stylesheet", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "src/components/marketing/workflow-gallery.module.css"), "utf8");

    expect(stylesheet).toContain("padding: clamp(120px, 11vw, 176px) clamp(32px, 4.45vw, 72px);");
    expect(stylesheet).toContain("grid-column: 1 / span 4;");
    expect(stylesheet).toContain("grid-column: 5 / -1;");
    // 576 cleared the tallest flow; the template link adds a 52px row.
    expect(stylesheet).toMatch(/\.stage \{[^}]*min-block-size: 628px;/);
    expect(stylesheet).toMatch(/\.panel \{[^}]*grid-template-rows: minmax\(0, 1fr\) auto;/);
    // A display value on the panel would otherwise override [hidden].
    expect(stylesheet).toContain(".panel[hidden] { display: none; }");
    expect(stylesheet).toContain("@media (min-width: 768px) and (max-width: 1023px)");
    expect(stylesheet).toContain("grid-template-columns: 280px minmax(0, 1fr);");
    expect(stylesheet).toContain("min-block-size: 576px;");
    expect(stylesheet).toContain("@media (max-width: 767px)");
    expect(stylesheet).toContain("padding: 88px 20px;");
    expect(stylesheet).toContain("min-block-size: 76px;");
    expect(stylesheet).toContain("min-block-size: 360px;");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("lets the browser skip the section until it nears the viewport, with a measured content-box fallback height", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "src/components/marketing/workflow-gallery.module.css"), "utf8");
    const section = stylesheet.match(/^\.section \{[^}]+\}/m)?.[0] ?? "";

    expect(section).toContain("content-visibility: auto;");
    expect(section).toMatch(/contain-intrinsic-block-size: auto \d+px;/);
    // Block axis only, so the placeholder never claims a fixed width.
    expect(stylesheet).not.toContain("contain-intrinsic-size:");
    // Content-box heights (rendered height minus block padding and border),
    // in source order: desktop, wide (1600px and up), tablet, phone. The
    // browser adds the padding itself, so a full-section height here makes
    // in-page links clicked from higher up the page scroll past the section.
    const heights = [...stylesheet.matchAll(/contain-intrinsic-block-size: auto (\d+)px;/g)].map((match) => Number(match[1]));
    expect(heights).toEqual([900, 940, 840, 1165]);
  });
});
