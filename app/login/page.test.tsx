// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ checkRequestSession: vi.fn(), redirect: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn(), host: "app.linkar.in" }));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({ publicSiteUrl: "https://linkar.in", appUrl: "https://app.linkar.in", adminUrl: "https://admin.linkar.in" }),
}));
vi.mock("@/src/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/auth/session")>()),
  checkRequestSession: mocks.checkRequestSession,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mocks.redirect(path);
    throw new Error("NEXT_REDIRECT");
  },
  // The marketing header marks the current page.
  usePathname: () => "/login",
  unstable_rethrow: () => {},
}));
// No remembered plan intent unless a test sets the pricing query itself.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ host: mocks.host }),
}));
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { verifyOtp: mocks.verifyOtp, signOut: mocks.signOut } }),
}));

const { default: LoginPage, metadata: loginMetadata } = await import("./page");
const { POST: logout } = await import("@/app/api/auth/logout/route");
const { applicationOriginForPath } = await import("@/src/lib/site-routing");
const { contentSecurityPolicy } = await import("@/src/lib/security/headers");
const { default: SignupPage, metadata: signupMetadata } = await import("@/app/signup/page");
const { default: ConfirmPage } = await import("@/app/auth/confirm/page");

describe("auth pages", () => {
  beforeEach(() => {
    mocks.checkRequestSession.mockReset().mockResolvedValue({ session: null, authUnavailable: false });
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
    mocks.host = "app.linkar.in";
  });

  it("sends an already signed-in visitor on to their destination", async () => {
    mocks.checkRequestSession.mockResolvedValue({ session: { userId: "u1", email: "a@example.com", workspaceId: "w1" }, authUnavailable: false });
    await expect(LoginPage({ searchParams: Promise.resolve({ next: "/automations" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/automations");
  });

  // Nothing was submitted on a page load, so the notice does not mention a password.
  const SESSION_CHECK_NOTICE = "We could not check your sign-in just now, so signing in may not work yet. Try again in a minute.";

  it("still shows the form when the session check fails, with a notice that sign-in may not work yet", async () => {
    mocks.checkRequestSession.mockRejectedValue(Object.assign(new Error("Timed out fetching a new connection from the connection pool."), { code: "P2024" }));
    render(await LoginPage({ searchParams: Promise.resolve({ next: "/automations" }) }));

    expect(mocks.redirect).not.toHaveBeenCalled();
    const form = screen.getByRole("form", { name: "Sign in to Linkar" });
    expect(form.querySelector<HTMLInputElement>('input[name="next"]')?.value).toBe("/automations");
    const notice = screen.getByRole("alert");
    expect(notice.textContent).toBe(SESSION_CHECK_NOTICE);
    // The notice sits above the form.
    expect(notice.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the same notice when Supabase Auth could not answer the session check", async () => {
    mocks.checkRequestSession.mockResolvedValue({ session: null, authUnavailable: true });
    render(await LoginPage({ searchParams: Promise.resolve({ next: "/automations" }) }));

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(SESSION_CHECK_NOTICE);
    expect(screen.getByRole("form", { name: "Sign in to Linkar" })).toBeTruthy();
  });

  it("keeps a more specific error from the last attempt over the notice", async () => {
    mocks.checkRequestSession.mockRejectedValue(new Error("database unreachable"));
    render(await LoginPage({ searchParams: Promise.resolve({ error: "locked" }) }));
    expect(screen.getByRole("alert").textContent).toBe("Too many attempts. Wait fifteen minutes before trying again.");
  });

  it("says the password was not checked when the login route could not reach Supabase Auth", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "unavailable" }) }));
    expect(screen.getByRole("alert").textContent).toBe("We could not reach the sign-in service, so your password was not checked. Try again in a minute.");
    expect(screen.getByRole("form", { name: "Sign in to Linkar" })).toBeTruthy();
  });

  it("shows no notice when the session check simply finds no session", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps owner-console sign-in on the console host, whatever next it was given", async () => {
    mocks.host = "admin.linkar.in";
    for (const next of [undefined, "/dashboard", "/onboarding", "/administrator"]) {
      render(await LoginPage({ searchParams: Promise.resolve(next === undefined ? {} : { next }) }));
      const form = screen.getByRole("form", { name: "Sign in to Linkar" });
      expect(form.querySelector<HTMLInputElement>('input[name="next"]')?.value, String(next)).toBe("/admin");
      cleanup();
    }
    render(await LoginPage({ searchParams: Promise.resolve({ next: "/admin/system?tab=jobs" }) }));
    expect(screen.getByRole("form", { name: "Sign in to Linkar" }).querySelector<HTMLInputElement>('input[name="next"]')?.value)
      .toBe("/admin/system?tab=jobs");
  });

  it("sends a signed-in owner on the console host to the console, not the workspace", async () => {
    mocks.host = "admin.linkar.in";
    mocks.checkRequestSession.mockResolvedValue({ session: { userId: "u1", email: "owner@example.com", workspaceId: "w1" }, authUnavailable: false });
    await expect(LoginPage({ searchParams: Promise.resolve({ next: "/dashboard" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin");
  });

  it("leaves next alone on the app host", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("form", { name: "Sign in to Linkar" }).querySelector<HTMLInputElement>('input[name="next"]')?.value).toBe("/dashboard");
  });

  it("signs the owner out and back in without leaving the console origin", async () => {
    // Sign out on admin.linkar.in lands on its own login page, carrying next=/admin.
    const response = await logout(new Request("http://127.0.0.1:3000/api/auth/logout", { method: "POST", headers: { "x-forwarded-host": "admin.linkar.in" } }));
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(303);
    const login = new URL(response.headers.get("location") ?? "");
    expect(login.href).toBe("https://admin.linkar.in/login?next=%2Fadmin");

    // That page, and a bookmarked one with no next or a workspace next, post a
    // next the login route answers on the console origin, success or error.
    mocks.host = login.host;
    const env = { appUrl: "https://app.linkar.in", adminUrl: "https://admin.linkar.in" };
    const formAction = contentSecurityPolicy({ production: true, publicSite: false }).split(";").map((part) => part.trim().split(/\s+/)).find(([name]) => name === "form-action")?.slice(1) ?? [];
    for (const params of [Object.fromEntries(login.searchParams), {}, { next: "/dashboard" }]) {
      render(await LoginPage({ searchParams: Promise.resolve(params) }));
      const next = screen.getByRole("form", { name: "Sign in to Linkar" }).querySelector<HTMLInputElement>('input[name="next"]')?.value ?? "";
      const destination = applicationOriginForPath(next, env);
      expect(destination, JSON.stringify(params)).toBe(login.origin);
      expect(formAction).toContain("'self'");
      cleanup();
    }
  });

  it("signs a workspace member out to the app host's login page", async () => {
    const response = await logout(new Request("http://127.0.0.1:3000/api/auth/logout", { method: "POST", headers: { "x-forwarded-host": "app.linkar.in" } }));
    expect(response.headers.get("location")).toBe("https://app.linkar.in/login");
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

  it("tells a returning customer that checkout follows sign-in, unless they were invited", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ plan: "growth", interval: "annual" }) }));
    expect(screen.getByRole("status").textContent).toBe("You picked the Growth plan, billed yearly. Sign in and we will take you to checkout.");

    cleanup();
    render(await LoginPage({ searchParams: Promise.resolve({ plan: "growth", interval: "annual", invite: "raw-token" }) }));
    expect(screen.queryByText(/You picked the/)).toBeNull();

    cleanup();
    render(await LoginPage({ searchParams: Promise.resolve({ plan: "free" }) }));
    expect(screen.queryByText(/You picked the/)).toBeNull();
  });

  it("carries the picked plan through a signup confirmation link opened in another browser", async () => {
    render(await ConfirmPage({ searchParams: Promise.resolve({ token_hash: "hash", type: "signup", next: "/automations", plan: "agency", interval: "annual" }) }));
    const form = document.querySelector("form");
    expect(form?.querySelector<HTMLInputElement>('input[name="plan"]')?.value).toBe("agency");
    expect(form?.querySelector<HTMLInputElement>('input[name="interval"]')?.value).toBe("annual");

    cleanup();
    render(await ConfirmPage({ searchParams: Promise.resolve({ token_hash: "hash", type: "signup", plan: "agency", interval: "annual", invite: "raw-token" }) }));
    expect(document.querySelector('input[name="plan"]')).toBeNull();

    cleanup();
    render(await ConfirmPage({ searchParams: Promise.resolve({ token_hash: "hash", type: "recovery", plan: "agency" }) }));
    expect(document.querySelector('input[name="plan"]')).toBeNull();
  });
});
