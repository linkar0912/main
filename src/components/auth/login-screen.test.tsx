// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({ publicSiteUrl: "https://linkar.in", appUrl: "https://app.linkar.in" }),
}));
// Marks every next/link anchor, so a test can tell it from a plain <a>.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode } & Record<string, unknown>) => {
    const anchorProps = Object.fromEntries(Object.entries(rest).filter(([key]) => !["prefetch", "scroll", "replace"].includes(key)));
    return <a data-next-link="" href={String(href)} {...anchorProps}>{children}</a>;
  },
}));

const { LoginScreen } = await import("./login-screen");
const {
  adoptOnboardingIdentity,
  deferOnboarding,
  ONBOARDING_DEFERRED_KEY,
  ONBOARDING_IDENTITY_KEY,
  ONBOARDING_NOT_REQUIRED_KEY,
  rememberOnboardingNotRequired,
} = await import("@/src/lib/onboarding/redirect");

describe("LoginScreen host routing", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    vi.stubGlobal("IntersectionObserver", undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("points the marketing chrome at the marketing host, not the app host it is served from", () => {
    // This screen runs on app.linkar.in. A relative "/#top" resolves to
    // app.linkar.in/, which the proxy sends to /dashboard, which is gated - so
    // the header used to bounce the visitor back to the login page they were
    // already looking at.
    render(<LoginScreen nextPath="/dashboard" />);

    const brandLinks = screen.getAllByRole("link", { name: /Linkar home/i });
    expect(brandLinks.length).toBeGreaterThan(0);
    for (const link of brandLinks) {
      expect(link.getAttribute("href")).toBe("https://linkar.in/#top");
    }

    const navigation = screen.getByRole("navigation", { name: "Primary" });
    expect(within(navigation).getByRole("link", { name: "Product" }).getAttribute("href"))
      .toBe("https://linkar.in/features");

    for (const [name, href] of [
      ["Privacy", "https://linkar.in/privacy"],
      ["Terms", "https://linkar.in/terms"],
      ["Data deletion", "https://linkar.in/data-deletion"],
    ] as const) {
      const link = screen.getAllByRole("link", { name }).at(0);
      expect(link?.getAttribute("href"), name).toBe(href);
    }
  });

  it("keeps app-bound links relative so they resolve on the app host", () => {
    render(<LoginScreen nextPath="/automations" />);

    // Sign-in/sign-up and the authenticated surfaces live on the same host this
    // page is served from, so absolutising them would only add a redirect.
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href"))
      .toBe("/signup?next=%2Fautomations");
    expect(screen.getByRole("link", { name: /Forgot your password/ }).getAttribute("href"))
      .toBe("/forgot-password");
    for (const name of ["Sign in"] as const) {
      const link = screen.getAllByRole("link", { name }).at(0);
      expect(link?.getAttribute("href")?.startsWith("/"), name).toBe(true);
    }
  });

  it("links account creation and password reset on the owner-console host to the app host with plain anchors", () => {
    // A next/link on admin.linkar.in would fetch /signup from the console
    // host, follow the redirect to app.linkar.in and trip connect-src.
    render(<LoginScreen nextPath="/admin" adminHost />);

    const signup = screen.getByRole("link", { name: "Create an account" });
    expect(signup.getAttribute("href")).toBe("https://app.linkar.in/signup?next=%2Fdashboard");
    expect(signup.hasAttribute("data-next-link")).toBe(false);
    const reset = screen.getByRole("link", { name: /Forgot your password/ });
    expect(reset.getAttribute("href")).toBe("https://app.linkar.in/forgot-password");
    expect(reset.hasAttribute("data-next-link")).toBe(false);
    expect(screen.getByRole("form", { name: "Sign in to Linkar" }).querySelector<HTMLInputElement>('input[name="next"]')?.value).toBe("/admin");
  });

  it("keeps client navigation for those links on the app host", () => {
    render(<LoginScreen nextPath="/automations" />);
    expect(screen.getByRole("link", { name: "Create an account" }).hasAttribute("data-next-link")).toBe(true);
    expect(screen.getByRole("link", { name: /Forgot your password/ }).hasAttribute("data-next-link")).toBe(true);
  });

  it("carries the requested destination through the sign-in form", () => {
    render(<LoginScreen nextPath="/automations/new" />);

    const form = screen.getByRole("form", { name: "Sign in to Linkar" });
    expect(form.getAttribute("action")).toBe("/api/auth/login");
    expect(form.getAttribute("method")).toBe("post");
    expect(form.querySelector<HTMLInputElement>('input[name="next"]')?.value).toBe("/automations/new");
  });

  it("drops the last account's onboarding flags for this tab, so the next sign-in starts clean", () => {
    try {
      adoptOnboardingIdentity("first@example.com");
      deferOnboarding();
      rememberOnboardingNotRequired(true);
      window.sessionStorage.setItem("linkar:home-range", "30");

      render(<LoginScreen nextPath="/dashboard" />);

      for (const key of [ONBOARDING_DEFERRED_KEY, ONBOARDING_NOT_REQUIRED_KEY, ONBOARDING_IDENTITY_KEY]) {
        expect(window.sessionStorage.getItem(key), key).toBeNull();
      }
      // Only the onboarding flags go.
      expect(window.sessionStorage.getItem("linkar:home-range")).toBe("30");
    } finally {
      window.sessionStorage.clear();
    }
  });

  it("still renders when the browser blocks storage", () => {
    const blocked = vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => { throw new Error("blocked"); });
    try {
      render(<LoginScreen nextPath="/dashboard" />);
      expect(screen.getByRole("form", { name: "Sign in to Linkar" })).toBeTruthy();
    } finally {
      blocked.mockRestore();
    }
  });
});
