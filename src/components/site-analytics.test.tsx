// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_CONSENT_COOKIE } from "@/src/lib/analytics-consent";
import { SiteAnalytics, resetSiteAnalyticsForTests, resolveMeasurementId } from "./site-analytics";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
const zone = vi.hoisted(() => ({ timeZone: "Asia/Kolkata" as string | undefined }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

vi.mock("@/src/lib/analytics-consent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/analytics-consent")>()),
  visitorTimeZone: () => zone.timeZone,
}));

vi.mock("./site-analytics-routes", () => ({
  SiteAnalyticsRoutes: ({ enabled }: { enabled: boolean }) => <span data-page-views={String(enabled)} />,
}));

vi.mock("next/script", () => ({
  default: ({ src, id }: { src?: string; id?: string }) => <script data-src={src} data-id={id} />,
}));

const ID = "G-TEST1234";

function clearConsentCookie() {
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=; Path=/; Max-Age=0`;
}

/** The gtag commands queued so far, as plain arrays. */
function commands(): unknown[][] {
  return (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
}

function loaderScripts(container: HTMLElement) {
  return container.querySelectorAll('script[data-id="google-analytics"]');
}

beforeEach(() => {
  resetSiteAnalyticsForTests();
  clearConsentCookie();
  navigation.pathname = "/";
  zone.timeZone = "Asia/Kolkata";
  window.history.replaceState(null, "", "/");
  delete window.dataLayer;
  delete window.gtag;
  delete window[`ga-disable-${ID}`];
});

afterEach(() => {
  cleanup();
  clearConsentCookie();
});

describe("resolveMeasurementId", () => {
  it("accepts a GA4 ID and rejects anything else", () => {
    expect(resolveMeasurementId(" G-CLMXQ4YFD1 ")).toBe("G-CLMXQ4YFD1");
    expect(resolveMeasurementId(undefined)).toBe("");
    expect(resolveMeasurementId("")).toBe("");
    expect(resolveMeasurementId('G-1";alert(1)')).toBe("");
    expect(resolveMeasurementId("UA-12345-1")).toBe("");
  });
});

describe("SiteAnalytics", () => {
  it("renders nothing, and queues nothing, without a measurement ID", () => {
    const { container } = render(<SiteAnalytics measurementId="" />);
    expect(container.innerHTML).toBe("");
    expect(window.dataLayer).toBeUndefined();
  });

  it("loads the tag once on a public page with Consent Mode v2 defaults ahead of config", () => {
    const { container, rerender } = render(<SiteAnalytics measurementId={ID} />);
    rerender(<SiteAnalytics measurementId={ID} />);

    const scripts = loaderScripts(container);
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute("data-src")).toBe(`https://www.googletagmanager.com/gtag/js?id=${ID}`);

    const queued = commands();
    const names = queued.map((command) => `${command[0]}:${command[0] === "consent" ? command[1] : ""}`);
    expect(names.indexOf("consent:default")).toBeLessThan(names.indexOf("config:"));
    // Outside the opt-in regions analytics starts granted; advertising never is.
    expect(queued).toContainEqual(["consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted" }]);
    expect(queued).toContainEqual([
      "consent",
      "default",
      expect.objectContaining({ analytics_storage: "denied", ad_storage: "denied", region: expect.arrayContaining(["DE", "FR", "GB", "IE", "NO", "CH"]) }),
    ]);
    expect(queued).toContainEqual(["config", ID, expect.objectContaining({ send_page_view: false, allow_google_signals: false })]);
    expect(queued.filter((command) => command[0] === "config")).toHaveLength(1);
    expect(JSON.stringify(queued)).not.toMatch(/"ad_storage":"granted"/);
    expect(screen.queryByRole("region", { name: "Analytics cookies" })).toBeNull();
  });

  it("starts denied and asks a visitor in Europe, then grants on Accept", () => {
    zone.timeZone = "Europe/Berlin";
    render(<SiteAnalytics measurementId={ID} />);

    expect(commands()).toContainEqual(["consent", "default", expect.objectContaining({ analytics_storage: "denied" })]);
    expect(commands().some((command) => command[0] === "consent" && command[1] === "default" && (command[2] as Record<string, unknown>).analytics_storage === "granted")).toBe(false);

    const banner = screen.getByRole("region", { name: "Analytics cookies" });
    expect(banner.textContent).toMatch(/stay off unless you accept/);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Accept" })); });

    expect(screen.queryByRole("region", { name: "Analytics cookies" })).toBeNull();
    expect(document.cookie).toContain(`${ANALYTICS_CONSENT_COOKIE}=granted`);
    expect(commands()).toContainEqual(["consent", "update", { analytics_storage: "granted" }]);
    expect(window[`ga-disable-${ID}`]).toBe(false);
  });

  it("reserves room for the notice at the end of the page until a choice is made", () => {
    zone.timeZone = "Europe/London";
    render(<SiteAnalytics measurementId={ID} />);

    const root = document.documentElement;
    expect(root.dataset.consentBanner).toBe("open");
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Decline" })); });
    expect(root.dataset.consentBanner).toBeUndefined();
    expect(root.style.getPropertyValue("--consent-banner-space")).toBe("");
  });

  it("stops sending at once on Decline, and never loads the tag again", () => {
    zone.timeZone = "Europe/Paris";
    const first = render(<SiteAnalytics measurementId={ID} />);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Decline" })); });

    expect(document.cookie).toContain(`${ANALYTICS_CONSENT_COOKIE}=denied`);
    expect(window[`ga-disable-${ID}`]).toBe(true);
    expect(commands()).toContainEqual(["consent", "update", { analytics_storage: "denied" }]);
    expect(loaderScripts(first.container)).toHaveLength(0);
    first.unmount();

    // A later page load reads the stored choice: no tag, no notice.
    resetSiteAnalyticsForTests();
    delete window.dataLayer;
    const second = render(<SiteAnalytics measurementId={ID} />);
    expect(loaderScripts(second.container)).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
    expect(screen.queryByRole("region", { name: "Analytics cookies" })).toBeNull();
  });

  it("applies a stored acceptance before the first hit", () => {
    zone.timeZone = "Europe/Madrid";
    document.cookie = `${ANALYTICS_CONSENT_COOKIE}=granted; Path=/`;
    render(<SiteAnalytics measurementId={ID} />);

    const queued = commands();
    const update = queued.findIndex((command) => command[0] === "consent" && command[1] === "update");
    expect(update).toBeGreaterThan(-1);
    expect(update).toBeLessThan(queued.findIndex((command) => command[0] === "config"));
    expect(screen.queryByRole("region", { name: "Analytics cookies" })).toBeNull();
  });

  it("never loads in a document that started in the signed-in app", () => {
    window.history.replaceState(null, "", "/dashboard");
    navigation.pathname = "/dashboard";
    const { container, rerender } = render(<SiteAnalytics measurementId={ID} />);
    expect(container.innerHTML).toBe("");

    // Not even after a client-side navigation to a public page.
    navigation.pathname = "/pricing";
    rerender(<SiteAnalytics measurementId={ID} />);
    expect(loaderScripts(container)).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
  });

  it("switches GA off when the visitor moves on into the app", () => {
    const { container, rerender } = render(<SiteAnalytics measurementId={ID} />);
    expect(window[`ga-disable-${ID}`]).toBe(false);
    expect(container.querySelector("[data-page-views]")?.getAttribute("data-page-views")).toBe("true");

    navigation.pathname = "/dashboard";
    rerender(<SiteAnalytics measurementId={ID} />);
    expect(window[`ga-disable-${ID}`]).toBe(true);
    expect(container.querySelector("[data-page-views]")?.getAttribute("data-page-views")).toBe("false");
  });

  it("stays off pages with a secret in the address", () => {
    window.history.replaceState(null, "", "/reset-password");
    navigation.pathname = "/reset-password";
    zone.timeZone = "Europe/Dublin";
    const { container } = render(<SiteAnalytics measurementId={ID} />);
    expect(container.innerHTML).toBe("");
  });
});
