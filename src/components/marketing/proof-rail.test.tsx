// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { ProofRail } from "./proof-rail";

const facts = [
  "Built on the official messaging API",
  "Tokens encrypted at rest",
  "Deterministic flow rules",
  "Follow-ups respect the messaging window",
] as const;

describe("ProofRail", () => {
  afterEach(cleanup);

  it("keeps the four verifiable Linkar facts in one accessible static list", () => {
    const markup = renderToStaticMarkup(<ProofRail />);
    render(<ProofRail />);

    const rail = screen.getByRole("region", { name: "Linkar product facts" });
    const lists = screen.getAllByRole("list");

    expect(rail.id).toBe("proof");
    expect(lists).toHaveLength(1);
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(facts);
    expect(markup).toContain(facts[0]);
    expect(markup).toContain(facts[1]);
    expect(markup).toContain(facts[2]);
    expect(markup).toContain(facts[3]);
  });

  it("keeps its loop duplicate out of assistive technology without introducing actions or claims", () => {
    render(<ProofRail />);

    const rail = screen.getByRole("region", { name: "Linkar product facts" });
    const duplicate = rail.querySelector('ul[aria-hidden="true"]');

    expect(duplicate?.querySelectorAll("li")).toHaveLength(4);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText(/customers|teams|people use|revenue|testimonial/i)).toBeNull();
  });

  it("exposes pause hooks and the canonical reduced-motion wrapping contract", () => {
    render(<ProofRail />);

    const rail = screen.getByRole("region", { name: "Linkar product facts" });
    const frame = rail.querySelector('[data-ticker="continuous"]');
    const canonical = frame?.querySelector("ul:not([aria-hidden=\"true\"])");

    expect(frame?.getAttribute("data-pause-on-hover")).toBe("true");
    expect(frame?.getAttribute("data-pause-on-focus")).toBe("true");
    expect(canonical?.getAttribute("data-reduced-motion-layout")).toBe("wrap");
  });
});
