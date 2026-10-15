import { resolveRobots, resolveSitemap } from "next/dist/build/webpack/loaders/metadata/resolve-route-data";
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
const { getSeoPages, SEO_CONTENT_UPDATED, seoCollections, seoPagePath } = await import("@/src/content/seo");
const { BILLING_PLANS, FREE_BILLING_PLAN } = await import("@/src/lib/billing/catalog");
const { LEGAL_ENTITY } = await import("@/src/lib/legal-entity");
const { HELP_PAGES_UPDATED, MARKETING_PAGES_UPDATED } = await import("@/src/lib/seo-pages");

afterEach(() => {
  requestHeaders.clear();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

/** The text between a heading line and the next heading of the same level or higher. */
function section(body: string, heading: string): string {
  const start = body.indexOf(`\n${heading}\n`);
  if (start === -1) throw new Error(`No ${heading} section`);
  const rest = body.slice(start + heading.length + 2);
  const end = rest.search(/\n## /);
  return end === -1 ? rest : rest.slice(0, end);
}

async function llms(): Promise<string> {
  const { GET } = await import("./llms.txt/route");
  return GET().text();
}

describe("robots.txt", () => {
  it("keeps crawlers out of the API, owner console, auth pages, and redirects on the marketing host", async () => {
    requestHeaders.set("host", "linkar.in");
    const result = await robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rules.allow).toBe("/");
    for (const path of ["/api/", "/admin", "/login", "/signup", "/forgot-password", "/reset-password", "/auth/", "/r/"]) {
      expect(rules.disallow).toContain(path);
    }
    expect(result.sitemap).toEqual([
      "https://linkar.in/sitemap.xml",
      "https://linkar.in/features/sitemap.xml",
      "https://linkar.in/solutions/sitemap.xml",
      "https://linkar.in/templates/sitemap.xml",
    ]);
  });

  it("has no Host line, which Google and Bing ignore", async () => {
    requestHeaders.set("host", "linkar.in");
    const result = await robots();
    expect(result.host).toBeUndefined();
    const text = resolveRobots(result);
    expect(text).not.toMatch(/^Host:/im);
    expect(text).toContain("Sitemap: https://linkar.in/sitemap.xml\n");
  });

  it("closes the app and admin hosts entirely", async () => {
    for (const host of ["app.linkar.in", "admin.linkar.in"]) {
      requestHeaders.set("host", host);
      const result = await robots();
      const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
      expect(rules.disallow).toBe("/");
      expect(result.sitemap).toBeUndefined();
      expect(resolveRobots(result)).not.toMatch(/^Host:/im);
    }
  });
});

describe("sitemap.xml", () => {
  const corePaths = ["/", "/pricing", "/support", "/contact", "/terms", "/refund-policy", "/privacy", "/cookies", "/acceptable-use", "/data-processing", "/service-providers", "/data-deletion"];
  const coreUrl = (path: string) => (path === "/" ? "https://linkar.in" : `https://linkar.in${path}`);

  it("lists the marketing and legal pages with absolute URLs", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain("https://linkar.in");
    for (const path of ["/pricing", "/terms", "/privacy", "/refund-policy", "/contact", "/cookies", "/support"]) {
      expect(urls).toContain(`https://linkar.in${path}`);
    }
    expect(urls.some((url) => /\/(login|signup|dashboard|admin|api|r)\b/.test(url))).toBe(false);
  });

  it("gives each of the 12 core pages the date its content last changed", () => {
    const entries = sitemap();
    const lastModified = (path: string) => entries.find((entry) => entry.url === coreUrl(path))?.lastModified;
    const core = entries.slice(0, corePaths.length);
    expect(core.map((entry) => entry.url)).toEqual(corePaths.map(coreUrl));
    for (const entry of core) expect(entry.lastModified, entry.url).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(lastModified("/")).toBe(MARKETING_PAGES_UPDATED);
    expect(lastModified("/pricing")).toBe(MARKETING_PAGES_UPDATED);
    expect(lastModified("/support")).toBe(HELP_PAGES_UPDATED);
    expect(lastModified("/contact")).toBe(HELP_PAGES_UPDATED);
    // The legal pages carry LEGAL_ENTITY.effectiveDate ("10 October 2026"),
    // except the three that gained the analytics disclosures on 13 October.
    expect(LEGAL_ENTITY.effectiveDate).toBe("10 October 2026");
    for (const path of ["/terms", "/refund-policy", "/acceptable-use", "/data-processing", "/data-deletion"]) {
      expect(lastModified(path), path).toBe("2026-10-10");
    }
    for (const path of ["/privacy", "/cookies", "/service-providers"]) {
      expect(lastModified(path), path).toBe("2026-10-13");
    }
    expect(resolveSitemap(core)).toContain("<loc>https://linkar.in/terms</loc>\n<lastmod>2026-10-10</lastmod>");
  });

  it("never takes a date from the build or request time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-03-01T08:00:00Z"));
    const first = sitemap();
    vi.setSystemTime(new Date("2028-07-19T20:30:00Z"));
    expect(sitemap()).toEqual(first);
    for (const entry of first) expect(entry.lastModified instanceof Date, entry.url).toBe(false);
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
    expect(body).toContain("- Creator: ₹199 a month or ₹1,990 a year, 20 automations, 5,000 outbound messages a month\n");
    expect(body).toContain("### Is Instagram DM automation allowed?");
    for (const heading of ["## Facts", "## Pages", "## Guides", "## Plans", "## Questions", "## Optional"]) expect(body).toContain(`\n${heading}\n`);
    expect(body).not.toContain("\u2014");
  });

  it("says which Linkar this is, how it is spelled, and uses the searcher's word once", async () => {
    const body = await llms();
    const summary = body.split("\n").find((line) => line.startsWith("> ")) ?? "";
    expect(summary.startsWith("> Linkar (linkar.in) is Instagram automation software")).toBe(true);
    expect(summary.match(/auto DM/g)).toHaveLength(1);
    expect(body).toContain("\nLinkar is spelled L-I-N-K-A-R. It is a separate product from DM Linkr, Linkr and LinkDM.\n");
  });

  it("states the buying facts from the billing catalog, /pricing and /terms", async () => {
    const facts = section(await llms(), "## Facts");
    const lines = facts.trim().split("\n");
    for (const line of lines) expect(line.startsWith("- "), line).toBe(true);

    expect(facts).toContain("include applicable GST");
    expect(facts).toContain("Razorpay");
    expect(facts).toMatch(/UPI, cards or netbanking/);
    expect(facts).toContain("tax invoice");
    const paid = Object.values(BILLING_PLANS);
    for (const plan of paid) expect(facts).toContain(`${plan.name} ₹${(plan.annualPaise / 100).toLocaleString("en-IN")}`);
    expect(facts).toContain(`The ${FREE_BILLING_PLAN.name} plan costs ₹0 and needs no card`);
    expect(facts).toContain("outbound messages");
    expect(facts).toContain("Incoming comments, DMs and Story replies are free.");
    expect(facts).toContain("At the monthly limit, automations stop sending");
    expect(facts).toContain("Nothing is charged beyond the plan");
    expect(facts).toContain("Cancel any time.");
    expect(facts).toContain("Instagram professional accounts (Business or Creator)");
    expect(facts).toContain("- Linkar is not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc.\n");
    expect(facts).toContain(`Support: ${LEGAL_ENTITY.supportEmail}`);
    const lastUpdated = [SEO_CONTENT_UPDATED, MARKETING_PAGES_UPDATED].sort().at(-1);
    expect(lines.at(-1)).toBe(`- Last updated: ${lastUpdated}`);
    expect(facts).not.toMatch(/\u2014|\bpayloads?\b|\brecipients?\b|\bwebhooks?\b/i);
  });

  it("lists every guide under its collection with a factual description, not ad copy", async () => {
    const body = await llms();
    const guides = section(body, "## Guides");
    for (const [collection, { label }] of Object.entries(seoCollections)) {
      const block = guides.split(`\n### ${label}\n`)[1]?.split("\n### ")[0] ?? "";
      const pages = getSeoPages(collection as keyof typeof seoCollections);
      const lines = block.trim().split("\n");
      expect(lines, label).toHaveLength(pages.length);
      pages.forEach((page, index) => {
        expect(lines[index]).toContain(`- [${page.label}](https://linkar.in${seoPagePath(page)}): `);
        expect(lines[index]).toContain(page.steps[0][0]);
        expect(lines[index]).toContain(`"${page.faq[0]}"`);
      });
    }
    expect(guides).not.toMatch(/Start free|with Linkar/);
    expect(guides).not.toMatch(/\/recipe\b/);
  });

  it("lists the 24 recipe Markdown downloads under Optional", async () => {
    const optional = section(await llms(), "## Optional");
    const urls = [...optional.matchAll(/\]\((https:\/\/linkar\.in\/[^)]+)\)/g)].map((match) => match[1]);
    const templates = getSeoPages("templates");
    expect(templates).toHaveLength(24);
    expect(urls).toEqual(templates.map((page) => `https://linkar.in${seoPagePath(page)}/recipe`));
    expect(optional.trim().split("\n")).toHaveLength(24);
  });
});
