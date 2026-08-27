// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ButtonRoll } from "./button-roll";

describe("ButtonRoll", () => {
  it("keeps one accessible label while rendering two visual copies", () => {
    render(<ButtonRoll label="Get started" />);

    const label = screen.getByLabelText("Get started");
    const copies = screen.getAllByText("Get started");

    expect(label.getAttribute("aria-label")).toBe("Get started");
    expect(copies).toHaveLength(2);
    expect(copies.every((copy) => copy.getAttribute("aria-hidden") === "true")).toBe(true);
  });
});
