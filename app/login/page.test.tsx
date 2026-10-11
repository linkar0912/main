// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getRequestSession: vi.fn(), redirect: vi.fn(), verifyOtp: vi.fn() }));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({ publicSiteUrl: "https://linkar.in", appUrl: "https://app.linkar.in" }),
}));
vi.mock("@/src/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/auth/session")>()),
  getRequestSession: mocks.getRequestSession,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mocks.redirect(path);
    throw new Error("NEXT_REDIRECT");
  },
  // The marketing header marks the current page.
  usePathname: () => "/login",
}));
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { verifyOtp: mocks.verifyOtp } }),
}));

const { default: LoginPage, metadata: loginMetadata } = await import("./page");
const { default: SignupPage, metadata: signupMetadata } = await import("@/app/signup/page");
const { default: ConfirmPage } = await import("@/app/auth/confirm/page");

describe("auth pages", () => {
  beforeEach(() => {
    mocks.getRequestSession.mockReset().mockResolvedValue(null);
    mocks.redirect.mockReset();
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    vi.stubGlobal("IntersectionObserver", undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("sends an already signed-in visitor on to their destination", async () => {
    mocks.getRequestSession.mockResolvedValue({ userId: "u1", email: "a@example.com", workspaceId: "w1" });
    await expect(LoginPage({ searchParams: Promise.resolve({ next: "/automations" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/automations");
  });

  it("explains an expired confirmation link and offers to resend it", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ verify: "invalid" }) }));
    expect(screen.getByRole("alert").textContent).toMatch(/confirmation link is invalid or has expired/i);
    const form = screen.getByRole("form", { name: "Resend confirmation email" });
    expect(form.getAttribute("action")).toBe("/api/auth/resend-confirmation");
  });

  it("names a cancelled OAuth sign-in as cancelled", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "cancelled" }) }));
    expect(screen.getByRole("alert").textContent).toMatch(/Sign-in was cancelled/);
  });

  it("says which sign-in did not finish and what else to try", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "oauth" }) }));
    expect(screen.getByRole("alert").textContent).toBe("Signing in with Google or Facebook did not finish. Try again, or use your email and password.");
  });

  it("carries an invite through the login form, OAuth links and the signup link", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ next: "/automations", invite: "raw-token" }) }));
    const form = screen.getByRole("form", { name: "Sign in to Linkar" });
    expect(form.querySelector<HTMLInputElement>('input[name="invite"]')?.value).toBe("raw-token");
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href"))
      .toBe("/signup?next=%2Fautomations&invite=raw-token");
    expect(screen.getByRole("link", { name: /Continue with Google/ }).getAttribute("href")).toContain("invite=raw-token");
  });

  it("shows the Terms and Privacy consent line above the sign-in actions", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));
    const notice = document.querySelector("[data-auth-legal]");
    expect(notice?.textContent).toMatch(/By continuing you agree to the Terms and Privacy Policy/);
    expect(notice?.querySelector("a")?.getAttribute("href")).toBe("https://linkar.in/terms");
  });

  it("keeps the auth pages out of search indexes with their own titles", () => {
    expect(loginMetadata.robots).toEqual({ index: false, follow: false });
    expect(String(loginMetadata.title)).toMatch(/^Sign in · /);
    expect(signupMetadata.robots).toEqual({ index: false, follow: false });
  });

  it("links password rules to the signup password field", async () => {
    render(await SignupPage({ searchParams: Promise.resolve({}) }));
    const password = document.querySelector<HTMLInputElement>('input[name="password"]');
    expect(password?.getAttribute("aria-describedby")).toBe("signup-password-rules");
    expect(document.getElementById("signup-password-rules")?.textContent).toMatch(/12 characters/);
  });

  it("offers resend and start over on the signup confirmation screen", async () => {
    render(await SignupPage({ searchParams: Promise.resolve({ sent: "1", email: "new@example.com", invite: "raw-token" }) }));
    const form = screen.getByRole("form", { name: "Resend confirmation email" });
    expect(form.querySelector<HTMLInputElement>('input[name="email"]')?.value).toBe("new@example.com");
    expect(form.querySelector<HTMLInputElement>('input[name="invite"]')?.value).toBe("raw-token");
    expect(screen.getByRole("link", { name: "Start over" }).getAttribute("href")).toBe("/signup?next=%2Fautomations&invite=raw-token");
  });

  it("does not verify an email token on page load; it asks for a click that POSTs", async () => {
    render(await ConfirmPage({ searchParams: Promise.resolve({ token_hash: "hash", type: "signup", next: "/automations" }) }));
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    const form = document.querySelector("form");
    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.getAttribute("action")).toBe("/api/auth/confirm");
    expect(form?.querySelector<HTMLInputElement>('input[name="token_hash"]')?.value).toBe("hash");
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });
});
