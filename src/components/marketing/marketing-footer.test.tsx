// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketingFooter } from "./marketing-footer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MarketingFooter", () => {
  it("renders four named columns and only real internal destinations", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<MarketingFooter />);

    const footer = screen.getByRole("contentinfo");
    const navigation = within(footer).getByRole("navigation", { name: "Footer" });
    expect(footer.id).toBe("resources");
    expect(within(footer).getByText(
      "Linkar keeps repeatable conversations moving and makes human attention count.",
    )).toBeTruthy();
    expect(within(footer).getByRole("heading", { name: "Product", level: 2 })).toBeTruthy();
    expect(within(footer).getByRole("heading", { name: "Resources", level: 2 })).toBeTruthy();
    expect(within(footer).getByRole("heading", { name: "Company", level: 2 })).toBeTruthy();
    expect(within(footer).getByRole("heading", { name: "Legal", level: 2 })).toBeTruthy();

    const expected = new Map([
      ["Product", "/#product"],
      ["Channels", "/#channels"],
      ["How it works", "/#how-it-works"],
      ["Workflows", "/#workflows"],
      ["Get started", "/signup"],
      ["Help", "/help"],
      ["Support", "/support"],
      ["Login", "/login"],
      ["Dashboard", "/dashboard"],
      ["Linkar home", "/#top"],
      ["Setup", "/#setup"],
      ["Questions", "/#faq"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["Data deletion", "/data-deletion"],
    ]);
    for (const [name, href] of expected) {
      const link = within(navigation).getByRole("link", { name });
      expect(link.getAttribute("href")).toBe(href);
    }

    const links = within(footer).getAllByRole("link");
    expect(links).toHaveLength(expected.size + 1);
    expect(links.every((link) => {
      const href = link.getAttribute("href") ?? "";
      return href.startsWith("/") || href.startsWith("#");
    })).toBe(true);
  });

  it("keeps legal copy and the visual wordmark truthful and non-duplicative", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<MarketingFooter />);

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText(`© ${new Date().getFullYear()} Linkar.`)).toBeTruthy();
    expect(within(footer).getByText(
      "Linkar uses Meta’s supported Instagram and Facebook interfaces. Availability and limits depend on the connected account, Page, and platform policies.",
    )).toBeTruthy();
    const brandLink = within(footer).getAllByRole("link", { name: "Linkar home" })
      .find((link) => link.className.includes("brandLink"));
    expect(brandLink).toBeTruthy();
    if (!brandLink) throw new Error("Brand link is missing");
    expect(brandLink.querySelector("svg")).toBeNull();
    expect(brandLink.textContent).toBe("Linkar");
    // The 22rem "LINKAR" stamp is gone, along with the ~900px of footer height
    // it needed. The brand link is the only place the name is set large now.
    expect(within(footer).queryByText("LINKAR")).toBeNull();
    expect(within(footer).getAllByRole("link").every((link) => !link.getAttribute("href")?.includes("://"))).toBe(true);
  });

  it("offers a compact version without changing its navigation contract", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<MarketingFooter compact />);

    const footer = screen.getByRole("contentinfo");
    expect(footer.getAttribute("data-compact")).toBe("true");
    expect(within(footer).getByRole("navigation", { name: "Footer" })).toBeTruthy();
    expect(within(footer).queryByText("LINKAR")).toBeNull();
  });
});
