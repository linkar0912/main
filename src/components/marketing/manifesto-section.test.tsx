// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { ManifestoSection } from "./manifesto-section";

const title = "The best conversations should keep working after you log off.";
const supportingLine = "Linkar carries the useful next step forward, then makes room for you when judgment matters.";

describe("ManifestoSection", () => {
  afterEach(cleanup);

  it("renders the product anchor with its exact editorial heading hierarchy", () => {
    render(<ManifestoSection />);

    const section = screen.getByRole("region", { name: title });
    const heading = screen.getByRole("heading", { level: 2, name: title });

    expect(section.id).toBe("product");
    expect(section.getAttribute("aria-labelledby")).toBe("manifesto-title");
    expect(section.hasAttribute("data-reveal")).toBe(true);
    expect(section.getAttribute("data-reduced-motion-state")).toBe("visible");
    expect(heading.id).toBe("manifesto-title");
    expect(screen.getByText(supportingLine)).toBeTruthy();
  });

  it("remains meaningful before reveal enhancement and contains no controls or external media", () => {
    const markup = renderToStaticMarkup(<ManifestoSection />);
    render(<ManifestoSection />);

    expect(markup).toContain(title);
    expect(markup).toContain(supportingLine);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.querySelectorAll("img, video, iframe, svg")).toHaveLength(0);
  });
});
