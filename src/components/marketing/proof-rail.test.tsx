// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProofRail } from "./proof-rail";

describe("ProofRail", () => {
  afterEach(cleanup);

  it("presents two creator conversation examples beside the audience statement", () => {
    render(<ProofRail />);

    const rail = screen.getByRole("region", { name: "Creator conversation examples" });
    expect(rail.id).toBe("proof");
    expect(rail.getAttribute("data-brand-palette")).toBe("linkar");
    expect(rail.getAttribute("data-strip")).toBe("creator-marquee");
    expect(within(rail).getByRole("heading", {
      level: 2,
      name: "Made for creators, marketers & brands.",
    })).toBeTruthy();

    const examples = within(rail).getAllByRole("article");
    expect(examples).toHaveLength(2);
    expect(examples[0]?.getAttribute("aria-label")).toBe("Aanya Mehta, beauty creator");
    expect(examples[1]?.getAttribute("aria-label")).toBe("Arjun Nair, growth marketer");
  });

  it("keeps the audience statement fixed while the creator examples live in a right-hand ticker", () => {
    render(<ProofRail />);

    const rail = screen.getByRole("region", { name: "Creator conversation examples" });
    expect(rail.getAttribute("data-proof-layout")).toBe("compact");
    const statement = rail.querySelector("[data-proof-statement]");
    const ticker = rail.querySelector("[data-proof-ticker]");
    const track = ticker?.querySelector("[data-proof-track]");
    const duplicate = ticker?.querySelector('[data-proof-duplicate][aria-hidden="true"]');

    expect(statement).not.toBeNull();
    expect(ticker).not.toBeNull();
    expect(track).not.toBeNull();
    expect(duplicate).not.toBeNull();
    expect(ticker?.querySelectorAll("[data-proof-card]")).toHaveLength(2);
  });

  it("uses descriptive local creator portraits", () => {
    render(<ProofRail />);

    const aanyaCard = screen.getByRole("article", { name: "Aanya Mehta, beauty creator" });
    const arjunCard = screen.getByRole("article", { name: "Arjun Nair, growth marketer" });
    const aanya = within(aanyaCard).getByAltText("Aanya Mehta at a Bengaluru cafe") as HTMLImageElement;
    const arjun = within(arjunCard).getByAltText("Arjun Nair on a Mumbai terrace") as HTMLImageElement;

    expect(aanya.getAttribute("src")).toContain("linkar-creator-aanya");
    expect(arjun.getAttribute("src")).toContain("linkar-creator-arjun");
  });

  it("labels the cards as examples without unsupported customer or follower claims", () => {
    render(<ProofRail />);

    const visibleCards = within(screen.getByRole("region", { name: "Creator conversation examples" }))
      .getAllByRole("article");
    expect(visibleCards.map((card) => within(card).getByText(/Creator workflow/i))).toHaveLength(2);
    expect(screen.queryByText(/followers|customers|revenue|million|testimonial/i)).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
