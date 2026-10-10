// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SubmitButton } from "./submit-button";

afterEach(cleanup);

describe("SubmitButton", () => {
  it("disables itself and shows the pending label once its plain HTML form submits", () => {
    render(
      <form action="/api/auth/login" method="post" onSubmit={(event) => event.preventDefault()}>
        <SubmitButton pendingLabel="Signing in...">Sign in</SubmitButton>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Sign in" });
    expect(button.hasAttribute("disabled")).toBe(false);

    // React's onSubmit above prevents jsdom navigation; the native listener
    // runs first in the bubbling order, so it sees an un-prevented submit.
    act(() => {
      fireEvent.submit(button.closest("form")!);
    });

    const pending = screen.getByRole("button", { name: "Signing in..." });
    expect(pending.hasAttribute("disabled")).toBe(true);
  });
});
