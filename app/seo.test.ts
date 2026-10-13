import { afterEach, describe, expect, it, vi } from "vitest";

const requestHeaders = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => requestHeaders.get(name) ?? null }),
}));

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font" });
  return { Bricolage_Grotesque: font, JetBrains_Mono: font, Manrope: font };
});
vi.mock("./public.css", () => ({}));

const { default: robots } = await import("./robots");
const { default: sitemap } = await import("./sitemap");
const { metadata: rootMetadata } = await import("./layout");

afterEach(() => {
  requestHeaders.clear();
  vi.unstubAllEnvs();
});

describe("robots.txt", () => {
  it("keeps crawlers out of the API, owner console, auth pages, and redirects on the marketing host", async () => {
    requestHeaders.set("host", "linkar.in");
    const result = await robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rules.allow).toBe("/");
    for (const path of ["/api/", "/admin", "/login", "/signup", "/forgot-password", "/reset-password", "/auth/", "/r/"]) {
      expect(rules.disallow).toContain(path);
    }
    expect(result.sitemap).toBe("https://linkar.in/sitemap.xml");
  });

  it("closes the app and admin hosts entirely", async () => {
    for (const host of ["app.linkar.in", "admin.linkar.in"]) {
      requestHeaders.set("host", host);
      const result = await robots();
      const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
      expect(rules.disallow).toBe("/");
      expect(result.sitemap).toBeUndefined();
    }
  });
});

describe("sitemap.xml", () => {
  it("lists the marketing and legal pages with absolute URLs", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain("https://linkar.in");
    for (const path of ["/pricing", "/terms", "/privacy", "/refund-policy", "/contact", "/cookies", "/support"]) {
      expect(urls).toContain(`https://linkar.in${path}`);
    }
    expect(urls.some((url) => /\/(login|signup|dashboard|admin|api|r)\b/.test(url))).toBe(false);
  });
});

describe("root metadata", () => {
  it("resolves canonical and Open Graph URLs against the marketing origin", () => {
    expect(rootMetadata.metadataBase?.toString()).toBe("https://linkar.in/");
    expect(rootMetadata.description).toBeTruthy();
    expect(rootMetadata.openGraph).toMatchObject({ siteName: "Linkar", type: "website" });
    expect(rootMetadata.twitter).toMatchObject({ card: "summary_large_image" });
  });
});

describe("llms.txt", () => {
  it("summarises the site in Markdown with catalog prices and the homepage FAQ", async () => {
    const { GET } = await import("./llms.txt/route");
    const response = GET();
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(body.startsWith("# Linkar\n")).toBe(true);
    expect(body).toContain("https://linkar.in/pricing");
    expect(body).toContain("Creator: ₹199 a month");
    expect(body).toContain("### Is Instagram DM automation allowed?");
  });
});
