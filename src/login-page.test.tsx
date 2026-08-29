// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import LoginPage from "@/app/login/page";

afterEach(cleanup);

describe("LoginPage", () => {
  it("presents the conversation desk layout under the marketing header", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    const main = screen.getByRole("main");
    expect(main.getAttribute("data-login-layout")).toBe("conversation-desk");
    expect(main.getAttribute("data-auth-tone")).toBe("editorial");
    // The marketing header supplies the Linkar home link, scoped to the banner.
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("link", { name: "Linkar home" }).textContent).toBe("Linkar");
    expect(screen.getByRole("heading", { name: "Keep the right conversations moving.", level: 1 })).toBeTruthy();
  });

  it("keeps the login endpoint, next path, fields, and recovery links intact", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ next: "/dashboard" }) }));

    const form = screen.getByRole("form", { name: "Sign in to Linkar" });
    expect(form.getAttribute("action")).toBe("/api/auth/login");
    expect(within(form).getByRole("textbox", { name: "Email" }).getAttribute("autocomplete")).toBe("username");
    expect(within(form).getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
    expect(within(form).getByDisplayValue("/dashboard").getAttribute("name")).toBe("next");
    expect(within(form).getByRole("button", { name: /sign in/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toContain("/signup");
    expect(screen.getByRole("link", { name: /Forgot your password/i }).getAttribute("href")).toBe("/forgot-password");
  });
});
