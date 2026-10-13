// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SignupPage from "@/app/signup/page";
import ForgotPasswordPage from "@/app/forgot-password/page";
import ResetPasswordPage from "@/app/reset-password/page";

vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: null } }) },
  }),
}));

const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined) }),
}));

afterEach(() => {
  cleanup();
  cookieJar.clear();
});

describe("auth pages", () => {
  it("starts signup directly with its page heading", async () => {
    render(await SignupPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1, name: "Create your account." })).toBeTruthy();
    expect(within(screen.getByRole("main")).queryByText("Get started")).toBeNull();
  });

  it("acknowledges a paid plan picked on the pricing page instead of dropping it", async () => {
    render(await SignupPage({ searchParams: Promise.resolve({ plan: "growth", interval: "monthly" }) }));
    expect(screen.getByRole("status").textContent).toBe("You picked the Growth plan, billed monthly. After a quick setup, we will take you to checkout.");
    expect(screen.queryByText(/in Settings, under Billing/)).toBeNull();

    cleanup();
    render(await SignupPage({ searchParams: Promise.resolve({ plan: "agency", interval: "annual" }) }));
    expect(screen.getByRole("status").textContent).toContain("You picked the Agency plan, billed yearly.");

    cleanup();
    render(await SignupPage({ searchParams: Promise.resolve({ plan: "growth", interval: "weekly" }) }));
    expect(screen.queryByRole("status")).toBeNull();

    cleanup();
    render(await SignupPage({ searchParams: Promise.resolve({ plan: "toString" }) }));
    expect(screen.queryByRole("status")).toBeNull();

    cleanup();
    render(await SignupPage({ searchParams: Promise.resolve({ plan: "growth", invite: "abc123" }) }));
    expect(screen.queryByText(/You picked the/)).toBeNull();
  });

  it("keeps the plan note from the remembered intent when an error drops the query", async () => {
    cookieJar.set("linkar_plan_intent", `creator.annual.${Math.floor(Date.now() / 1000)}`);
    render(await SignupPage({ searchParams: Promise.resolve({ error: "password" }) }));
    expect(screen.getByRole("status").textContent).toContain("You picked the Creator plan, billed yearly.");

    cleanup();
    render(await SignupPage({ searchParams: Promise.resolve({ invite: "abc123" }) }));
    expect(screen.queryByText(/You picked the/)).toBeNull();

    cleanup();
    cookieJar.set("linkar_plan_intent", `creator.annual.${Math.floor(Date.now() / 1000) - 25 * 3600}`);
    render(await SignupPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByText(/You picked the/)).toBeNull();
  });

  it("starts password recovery directly with its page heading", async () => {
    render(await ForgotPasswordPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1, name: "Reset your password" })).toBeTruthy();
    expect(screen.queryByText("Account recovery")).toBeNull();
  });

  it("keeps reset-password states free of decorative labels", async () => {
    render(await ResetPasswordPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1, name: "Set a new password" })).toBeTruthy();
    expect(screen.queryByText("Account recovery")).toBeNull();
  });

  it("gives each dead-end reset state one clear way forward", async () => {
    render(await ResetPasswordPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "Request a reset link" }).getAttribute("href")).toBe("/forgot-password");

    cleanup();
    render(await ResetPasswordPage({ searchParams: Promise.resolve({ error: "invalid" }) }));
    expect(screen.getByRole("link", { name: "Request a new link" }).getAttribute("href")).toBe("/forgot-password");
  });

  it("points back to sign in with the same verb the rest of the site uses", async () => {
    render(await ForgotPasswordPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe("/login");
  });
});
