// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage, { generateMetadata } from "@/app/page";
import { PublicPage } from "./public-page";

describe("PublicPage", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses the Linkar marketing header and compact footer around policy content", () => {
    render(<PublicPage currentPath="/privacy" title="Privacy" intro="How Linkar handles your data."><p>Policy content</p></PublicPage>);

    const header = screen.getByRole("banner");
    expect(header).toBeTruthy();
    expect(within(header).getByRole("link", { name: "Linkar home" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Privacy content" })).toBeTruthy();
    expect(screen.getByRole("contentinfo").getAttribute("data-compact")).toBe("true");
  });

  it("links the three legal documents and identifies the current one", () => {
    render(<PublicPage currentPath="/privacy" title="Privacy" intro="How Linkar handles your data."><p>Policy content</p></PublicPage>);

    const navigation = within(screen.getByRole("navigation", { name: "Legal documents" }));
    expect(navigation.getByRole("link", { name: "Privacy" }).getAttribute("aria-current")).toBe("page");
    expect(navigation.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
    expect(navigation.getByRole("link", { name: "Data deletion" }).getAttribute("href")).toBe("/data-deletion");
  });

  it("names both supported channels in public page copy and metadata", async () => {
    const metadata = await generateMetadata();
    const page = render(<HomePage />);
    const publicMain = page.container.querySelector("main");

    expect(publicMain).not.toBeNull();
    expect(publicMain?.textContent ?? "").toMatch(/instagram/i);
    expect(publicMain?.textContent ?? "").toMatch(/facebook/i);
    expect(`${metadata.title} ${metadata.description}`).toMatch(/instagram/i);
    expect(`${metadata.title} ${metadata.description}`).toMatch(/facebook/i);
  });
});
