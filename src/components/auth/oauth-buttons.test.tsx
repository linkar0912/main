// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OAuthButtons } from "./oauth-buttons";

afterEach(cleanup);

describe("OAuthButtons", () => {
  it("renders a Google and a Facebook continue button, each posting to its own provider route", () => {
    render(<OAuthButtons next="/dashboard" />);

    const google = screen.getByRole("button", { name: /continue with google/i });
    const facebook = screen.getByRole("button", { name: /continue with facebook/i });

    expect(google.closest("form")?.getAttribute("action")).toBe("/api/auth/oauth/google");
    expect(google.closest("form")?.getAttribute("method")).toBe("post");
    expect(facebook.closest("form")?.getAttribute("action")).toBe("/api/auth/oauth/facebook");
    expect(facebook.closest("form")?.getAttribute("method")).toBe("post");
  });

  it("carries the next path through both forms as a hidden field", () => {
    render(<OAuthButtons next="/automations" />);

    const nextInputs = document.querySelectorAll<HTMLInputElement>('input[name="next"]');
    expect(nextInputs).toHaveLength(2);
    for (const input of nextInputs) expect(input.value).toBe("/automations");
  });

  it("carries an invite token through both forms when provided", () => {
    render(<OAuthButtons next="/dashboard" invite="invite-token-123" />);

    const inviteInputs = document.querySelectorAll<HTMLInputElement>('input[name="invite"]');
    expect(inviteInputs).toHaveLength(2);
    for (const input of inviteInputs) expect(input.value).toBe("invite-token-123");
  });

  it("omits the invite field entirely when no invite is given", () => {
    render(<OAuthButtons next="/dashboard" />);
    expect(document.querySelectorAll('input[name="invite"]')).toHaveLength(0);
  });
});
