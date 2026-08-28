// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinalCta } from "./final-cta";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FinalCta", () => {
  it("renders the exact invitation, actions, and local flow detail", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<FinalCta />);

    const section = screen.getByRole("region", {
      name: "Give every promising conversation a next step.",
    });
    expect(section.id).toBe("get-started");
    expect(within(section).getByText(
      "Build your first Linkar flow, publish it with clear rules, and stay close to the moments that need you.",
    )).toBeTruthy();

    expect(within(section).getByRole("link", { name: "Create your flow" }).getAttribute("href")).toBe("/signup");
    expect(within(section).getByRole("link", { name: "See how it works" }).getAttribute("href")).toBe("/#how-it-works");

    const figure = within(section).getByRole("figure", { name: "A Linkar flow ready to publish" });
    expect(within(figure).getByText("Trigger ready")).toBeTruthy();
    expect(within(figure).getByText("Reply shaped")).toBeTruthy();
    expect(within(figure).getByText("Handoff clear")).toBeTruthy();
    expect(figure.querySelector("img")).toBeNull();
    expect(figure.hasAttribute("data-reveal")).toBe(true);
  });

  it("keeps both action links and reveal hooks in server-rendered markup", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<FinalCta />);

    const section = screen.getByRole("region", {
      name: "Give every promising conversation a next step.",
    });
    const links = within(section).getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(section.querySelectorAll("[data-reveal]")).toHaveLength(2);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/signup", "/#how-it-works"]);
  });
});
