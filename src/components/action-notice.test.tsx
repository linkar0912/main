// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionNotice } from "./action-notice";

describe("ActionNotice", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders errors as a dismissible popup", () => {
    const onDismiss = vi.fn();
    render(<ActionNotice tone="error" message="Choose a connected account." onDismiss={onDismiss} />);

    expect(screen.getByRole("alert").classList.contains("action-notice")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("announces successful saves without using alert semantics", () => {
    render(<ActionNotice tone="success" message="Saved and activated." onDismiss={() => undefined} />);
    expect(screen.getByRole("status").textContent).toContain("Saved and activated.");
  });
});
