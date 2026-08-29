// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordPage from "@/app/forgot-password/page";
import ResetPasswordPage from "@/app/reset-password/page";
import SignupPage from "@/app/signup/page";

// ResetPasswordPage checks for a Supabase session (via next/headers cookies()),
// which only exists inside a real Next.js request - not when calling the page
// function directly in a unit test. Stub it as "no session", the same state
// an unauthenticated visit to this page would be in.
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: null, error: { message: "no session" } }) },
  }),
}));

afterEach(cleanup);

describe("auth page visual shell", () => {
  it("uses the editorial tone without the graph-paper texture", async () => {
    render(await ForgotPasswordPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("main").getAttribute("data-auth-tone")).toBe("editorial");
    expect(document.querySelector(".auth-hero.grid-texture")).toBeNull();
    cleanup();

    render(await SignupPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("main").getAttribute("data-auth-tone")).toBe("editorial");
    expect(document.querySelector(".auth-hero.grid-texture")).toBeNull();
    cleanup();

    render(await ResetPasswordPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("main").getAttribute("data-auth-tone")).toBe("editorial");
    expect(document.querySelector(".auth-hero.grid-texture")).toBeNull();
  });
});
