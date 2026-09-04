// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteAnalytics } from "./site-analytics";

vi.mock("./site-analytics-routes", () => ({
  SiteAnalyticsRoutes: () => null,
}));

vi.mock("next/script", () => ({
  default: ({ src, id, children }: { src?: string; id?: string; children?: string }) => (
    <script data-src={src} data-id={id} data-inline={children} />
  ),
}));

describe("SiteAnalytics", () => {
  afterEach(cleanup);

  it("renders nothing when no measurement ID is configured", () => {
    const { container } = render(<SiteAnalytics measurementId="" />);
    expect(container.querySelectorAll("script")).toHaveLength(0);
  });

  it("loads the gtag script and configures the measurement ID", () => {
    const { container } = render(<SiteAnalytics measurementId="G-CLMXQ4YFD1" />);
    const scripts = [...container.querySelectorAll("script")];

    expect(scripts).toHaveLength(2);
    expect(scripts[0].getAttribute("data-src"))
      .toBe("https://www.googletagmanager.com/gtag/js?id=G-CLMXQ4YFD1");
    expect(scripts[1].getAttribute("data-inline"))
      .toContain('gtag(\'config\', "G-CLMXQ4YFD1", { send_page_view: false })');
  });

  it("JSON-encodes the ID into the inline script instead of interpolating it raw", () => {
    const { container } = render(<SiteAnalytics measurementId={'G-1";alert(1);//'} />);
    const inline = container.querySelectorAll("script")[1].getAttribute("data-inline") ?? "";

    // The quote that would close the string literal is escaped, so the call
    // stays a single argument rather than becoming a second statement.
    expect(inline).toContain('gtag(\'config\', "G-1\\";alert(1);//", { send_page_view: false })');
  });
});
