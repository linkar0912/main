// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({ publicSiteUrl: "https://linkar.in", appUrl: "https://app.linkar.in" }),
}));

const { LoginScreen } = await import("./login-screen");

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
      .toBe("https://linkar.in/#product");

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
    for (const name of ["Help", "Dashboard", "Login"] as const) {
      const link = screen.getAllByRole("link", { name }).at(0);
      expect(link?.getAttribute("href")?.startsWith("/"), name).toBe(true);
    }
  });

  it("carries the requested destination through the sign-in form", () => {
    render(<LoginScreen nextPath="/automations/new" />);

    const form = screen.getByRole("form", { name: "Sign in to Linkar" });
    expect(form.getAttribute("action")).toBe("/api/auth/login");
    expect(form.getAttribute("method")).toBe("post");
    expect(form.querySelector<HTMLInputElement>('input[name="next"]')?.value).toBe("/automations/new");
  });
});
