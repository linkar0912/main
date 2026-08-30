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

afterEach(cleanup);

describe("auth pages", () => {
  it("starts signup directly with its page heading", async () => {
    render(await SignupPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1, name: "Create your account." })).toBeTruthy();
    expect(within(screen.getByRole("main")).queryByText("Get started")).toBeNull();
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
});
