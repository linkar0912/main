// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage, { generateMetadata } from "@/app/page";
import { PublicPage } from "./public-page";

describe("PublicPage", () => {
  it("returns people to the gated dashboard", () => {
    render(<PublicPage title="Privacy" intro="How Linkar handles your data."><p>Policy content</p></PublicPage>);

    expect(screen.getByRole("link", { name: /back to app/i }).getAttribute("href")).toBe("/dashboard");
  });

  it("keeps third-party platform names out of public page copy and metadata", async () => {
    const metadata = await generateMetadata();
    const page = render(<HomePage />);
    const publicMain = page.container.querySelector("main");

    expect(publicMain).not.toBeNull();
    expect(publicMain?.textContent ?? "").not.toMatch(/instagram/i);
    expect(`${metadata.title} ${metadata.description}`).not.toMatch(/instagram/i);
  });
});
