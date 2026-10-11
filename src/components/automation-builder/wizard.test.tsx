// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderStepper, Field, KeywordInput, appendToken } from "./wizard";

function Keywords({ initial = "", onValue }: { initial?: string; onValue?: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <KeywordInput
        label="Words to look for"
        value={value}
        onChange={(next) => {
          setValue(next);
          onValue?.(next);
        }}
        suggestions={["PRICE", "link"]}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("KeywordInput", () => {
  afterEach(cleanup);

  it("turns comma-separated words into removable chips over the same comma-separated value", () => {
    render(<Keywords />);
    const input = screen.getByLabelText("Words to look for");

    fireEvent.change(input, { target: { value: "guide, Guide, menu" } });
    // The half-typed last word still counts, so a save right now keeps it.
    expect(screen.getByTestId("value").textContent).toBe("guide, menu");
    expect(screen.getByRole("button", { name: "Remove guide" })).toBeTruthy();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Remove menu" })).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Remove guide" }));
    expect(screen.getByTestId("value").textContent).toBe("menu");
  });

  it("adds a suggestion once and hides suggestions that are already chosen", () => {
    render(<Keywords initial="price" />);
    expect(screen.queryByRole("button", { name: "+ PRICE" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "+ link" }));
    expect(screen.getByTestId("value").textContent).toBe("price, link");
    expect(screen.queryByRole("button", { name: "+ link" })).toBeNull();
  });

  it("removes the last chip with Backspace in an empty input", () => {
    render(<Keywords initial="one, two" />);
    fireEvent.keyDown(screen.getByLabelText("Words to look for"), { key: "Backspace" });
    expect(screen.getByTestId("value").textContent).toBe("one");
  });
});

describe("Field", () => {
  afterEach(cleanup);

  it("labels its control and ties the hint and inline error to it", () => {
    render(
      <Field label="Automation name" hint="Only you see this." error="Give this automation a name first.">
        <input />
      </Field>,
    );
    const input = screen.getByLabelText("Automation name");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = (input.getAttribute("aria-describedby") ?? "").split(" ");
    const described = describedBy.map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(["Only you see this.", "Give this automation a name first."]);
    expect(screen.getByRole("alert").textContent).toBe("Give this automation a name first.");
  });
});

describe("BuilderStepper", () => {
  afterEach(cleanup);

  it("marks the current step and keeps every step clickable", () => {
    const onSelect = vi.fn();
    render(
      <BuilderStepper
        steps={[{ label: "When it runs" }, { label: "What it sends" }, { label: "Review" }]}
        active={1}
        unlocked={1}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole("button", { name: "Step 2: What it sends" }).getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("button", { name: "Step 3: Review" })).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByRole("button", { name: "Step 1: When it runs" }));
    expect(onSelect).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: "Step 3: Review" }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});

describe("appendToken", () => {
  it("adds a personalisation placeholder with one separating space", () => {
    expect(appendToken("", "{username}")).toBe("{username}");
    expect(appendToken("Hi", "{username}")).toBe("Hi {username}");
    expect(appendToken("Hi ", "{username}")).toBe("Hi {username}");
  });
});
