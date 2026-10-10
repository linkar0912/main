// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_CONSENT_COOKIE } from "@/src/lib/analytics-consent";
import { GoogleAnalyticsTag, SiteAnalytics, resetSiteAnalyticsConfigForTests } from "./site-analytics";

vi.mock("./site-analytics-routes", () => ({
  SiteAnalyticsRoutes: () => null,
}));

vi.mock("next/script", () => ({
  default: ({ src, id, children }: { src?: string; id?: string; children?: string }) => (
    <script data-src={src} data-id={id} data-inline={children} />
  ),
}));

function clearConsentCookie() {
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=; Path=/; Max-Age=0`;
}

function stubConfig(gaMeasurementId: string) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ gaMeasurementId }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("GoogleAnalyticsTag", () => {
  afterEach(cleanup);

  it("renders nothing when no measurement ID is configured", () => {
    const { container } = render(<GoogleAnalyticsTag measurementId="" />);
    expect(container.querySelectorAll("script")).toHaveLength(0);
  });

  it("loads gtag with Consent Mode v2 defaults denied before configuring the property", () => {
    const { container } = render(<GoogleAnalyticsTag measurementId="G-CLMXQ4YFD1" />);
    const scripts = [...container.querySelectorAll("script")];

    expect(scripts).toHaveLength(2);
    expect(scripts[0].getAttribute("data-src"))
      .toBe("https://www.googletagmanager.com/gtag/js?id=G-CLMXQ4YFD1");
    const inline = scripts[1].getAttribute("data-inline") ?? "";
    expect(inline).toContain("gtag('config', \"G-CLMXQ4YFD1\", { send_page_view: false })");
    const defaults = inline.indexOf("gtag('consent', 'default'");
    expect(defaults).toBeGreaterThanOrEqual(0);
    expect(inline.slice(defaults)).toMatch(/ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied'/);
    expect(defaults).toBeLessThan(inline.indexOf("gtag('config'"));
    // Advertising purposes are never granted.
    expect(inline).toContain("gtag('consent', 'update', { analytics_storage: 'granted' })");
    expect(inline).not.toMatch(/ad_storage: 'granted'/);
  });

  it("JSON-encodes the ID into the inline script instead of interpolating it raw", () => {
    const { container } = render(<GoogleAnalyticsTag measurementId={'G-1";alert(1);//'} />);
    const inline = container.querySelectorAll("script")[1].getAttribute("data-inline") ?? "";

    // The quote that would close the string literal is escaped, so the call
    // stays a single argument rather than becoming a second statement.
    expect(inline).toContain('gtag(\'config\', "G-1\\";alert(1);//", { send_page_view: false })');
  });
});

describe("SiteAnalytics", () => {
  beforeEach(() => {
    resetSiteAnalyticsConfigForTests();
    clearConsentCookie();
  });

  afterEach(() => {
    cleanup();
    clearConsentCookie();
    vi.unstubAllGlobals();
  });

  it("shows no banner and loads nothing when analytics is not configured", async () => {
    const fetchMock = stubConfig("");
    const { container } = render(<SiteAnalytics />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/site-config", expect.anything()));
    expect(screen.queryByRole("region", { name: "Analytics cookies" })).toBeNull();
    expect(container.querySelectorAll("script")).toHaveLength(0);
  });

  it("asks first and loads Google Analytics only after Accept", async () => {
    stubConfig("G-TEST1234");
    const { container } = render(<SiteAnalytics />);

    const banner = await screen.findByRole("region", { name: "Analytics cookies" });
    expect(container.querySelectorAll("script")).toHaveLength(0);

    act(() => { fireEvent.click(screen.getByRole("button", { name: "Accept" })); });

    expect(screen.queryByRole("region", { name: "Analytics cookies" })).toBeNull();
    expect(banner.isConnected).toBe(false);
    expect(document.cookie).toContain(`${ANALYTICS_CONSENT_COOKIE}=granted`);
    expect(container.querySelector("script")?.getAttribute("data-src")).toContain("id=G-TEST1234");
  });

  it("never loads Google Analytics after Reject, and remembers the choice", async () => {
    stubConfig("G-TEST1234");
    const first = render(<SiteAnalytics />);

    await screen.findByRole("region", { name: "Analytics cookies" });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Reject" })); });

    expect(document.cookie).toContain(`${ANALYTICS_CONSENT_COOKIE}=denied`);
    expect(first.container.querySelectorAll("script")).toHaveLength(0);
    first.unmount();

    // A later page load reads the stored choice and does not ask again.
    resetSiteAnalyticsConfigForTests();
    const second = render(<SiteAnalytics />);
    await waitFor(() => expect(second.container.querySelectorAll("script")).toHaveLength(0));
    expect(screen.queryByRole("region", { name: "Analytics cookies" })).toBeNull();
  });

  it("switches an already-loaded tag to denied when consent is withdrawn", async () => {
    stubConfig("G-TEST1234");
    const gtag = vi.fn();
    vi.stubGlobal("gtag", gtag);
    document.cookie = `${ANALYTICS_CONSENT_COOKIE}=granted; Path=/`;
    render(<SiteAnalytics />);
    await waitFor(() => expect(gtag).toHaveBeenCalledWith("consent", "update", { analytics_storage: "granted" }));

    const { writeAnalyticsConsent } = await import("@/src/lib/analytics-consent");
    act(() => writeAnalyticsConsent("denied"));

    expect(gtag).toHaveBeenLastCalledWith("consent", "update", { analytics_storage: "denied" });
    expect((window as unknown as Record<string, unknown>)["ga-disable-G-TEST1234"]).toBe(true);
  });
});
