// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ButtonRoll } from "./button-roll";

describe("ButtonRoll", () => {
  it("names a real action while keeping two visual copies decorative", () => {
    render(
      <a href="/signup">
        <ButtonRoll label="Get started" />
      </a>,
    );

    const action = screen.getByRole("link", { name: "Get started" });
    const animatedCopies = action.querySelectorAll('[aria-hidden="true"]');
    const accessibleCopy = screen.getByText("Get started", {
      selector: "span:not([aria-hidden])",
    });

    expect(action.getAttribute("href")).toBe("/signup");
    expect(action.contains(accessibleCopy)).toBe(true);
    expect(animatedCopies).toHaveLength(2);
    expect(Array.from(animatedCopies).every((copy) => copy.textContent === "Get started")).toBe(true);
  });
});
