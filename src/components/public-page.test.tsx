// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

  it("returns people to the gated dashboard", () => {
    render(<PublicPage title="Privacy" intro="How Linkar handles your data."><p>Policy content</p></PublicPage>);

    expect(screen.getByRole("link", { name: /back to app/i }).getAttribute("href")).toBe("/dashboard");
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
