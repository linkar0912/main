// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { BeforeAfterSection } from "./before-after-section";

const title = "Less inbox chasing. More conversations worth joining.";

describe("BeforeAfterSection", () => {
  afterEach(cleanup);

  it("server-renders the outcomes anchor with its complete two-surface comparison", () => {
    const markup = renderToStaticMarkup(<BeforeAfterSection />);
    render(<BeforeAfterSection />);
    const section = screen.getByRole("region", { name: title });
    const panels = within(section).getAllByRole("article");

    expect(section.id).toBe("outcomes");
    expect(section.getAttribute("data-reveal")).toBe("");
    expect(panels).toHaveLength(2);
    expect(within(panels[0]).getByRole("heading", { level: 3 }).textContent).toBe("Without a system");
    expect(within(panels[0]).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Repeat the same answer", "Lose context between replies", "Remember every follow-up", "Spot high intent too late",
    ]);
    expect(within(panels[1]).getByRole("heading", { level: 3 }).textContent).toBe("With Linkar in the loop");
    expect(within(panels[1]).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Guide delivered", "Goal captured: better leads", "Follow-up scheduled", "Context ready for a person",
    ]);
    expect(within(section).getByText("Automation handles the repeatable path. Your attention stays available for judgment.")).toBeTruthy();
    expect(markup).toContain("aria-hidden=\"true\"");
  });

  it("has no interactive controls and declares final static reduced-motion state", () => {
    render(<BeforeAfterSection />);
    const section = screen.getByRole("region", { name: title });

    expect(section.getAttribute("data-reduced-motion-state")).toBe("visible");
    expect(section.querySelectorAll("a, button, input, select, textarea")).toHaveLength(0);
    expect(section.querySelectorAll("ol > li")).toHaveLength(4);
    expect(section.querySelector("[data-comparison-divider]")?.getAttribute("aria-hidden")).toBe("true");
  });
});
