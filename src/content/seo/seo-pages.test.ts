import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getRelatedSeoPages, getSeoPage, getSeoPages, seoCollections, seoPages, seoPagePath, seoRecipeMarkdown, type SeoPage } from "./index";
import { seoCollectionMetadata, seoCollectionStructuredData, seoHeroImage, seoPageMetadata, seoStructuredData } from "@/src/lib/seo-pages";
import { seoHeroAsset } from "@/src/lib/seo-hero-assets";
import { isProtectedAppPath, marketingHref, resolveHostRedirect } from "@/src/lib/site-routing";
import sitemap from "@/app/sitemap";
import { GET } from "@/app/templates/[slug]/recipe/route";

function editorialText(page: SeoPage) {
  return [page.label, page.headline, page.description, page.intro, ...page.benefits.flat(), ...page.steps.flat(), ...Object.values(page.example), ...page.tip, ...page.faq].join(" ");
}

function shingles(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(words.slice(0, -7).map((_, index) => words.slice(index, index + 8).join(" ")));
}

afterEach(() => vi.unstubAllEnvs());

describe("public SEO catalogue", () => {
  it("publishes 64 distinct guides across three discoverable collections", () => {
    expect(seoPages).toHaveLength(64);
    expect(getSeoPages("features")).toHaveLength(20);
    expect(getSeoPages("solutions")).toHaveLength(20);
    expect(getSeoPages("templates")).toHaveLength(24);
    for (const values of [seoPages.map(seoPagePath), seoPages.map((page) => page.label), seoPages.map((page) => page.description), seoPages.map((page) => page.headline)]) {
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("keeps substantive editorial content rather than keyword-only duplicates", () => {
    const prose = seoPages.map((page) => ({ page, text: editorialText(page), phrases: shingles(editorialText(page)) }));
    for (const { page, text } of prose) {
      expect(text.split(/\s+/).length, seoPagePath(page)).toBeGreaterThanOrEqual(300);
      expect(page.steps).toHaveLength(3);
      expect(page.benefits.length).toBeGreaterThanOrEqual(2);
      expect(page.description.length).toBeGreaterThanOrEqual(120);
      expect(page.description.length).toBeLessThanOrEqual(165);
      expect(`${page.label} · Linkar`.length).toBeLessThanOrEqual(60);
    }
    for (let i = 0; i < prose.length; i++) {
      for (let j = i + 1; j < prose.length; j++) {
        const shared = [...prose[i].phrases].filter((phrase) => prose[j].phrases.has(phrase)).length;
        const overlap = shared / Math.min(prose[i].phrases.size, prose[j].phrases.size);
        expect(overlap, `${seoPagePath(prose[i].page)} vs ${seoPagePath(prose[j].page)}`).toBeLessThan(0.4);
      }
    }
  });

  it("has contextual internal links and valid local hero assets for every guide", () => {
    for (const page of seoPages) {
      const related = getRelatedSeoPages(page);
      expect(related, seoPagePath(page)).toHaveLength(3);
      expect(new Set(related.map(seoPagePath)).size).toBe(3);
      expect(related.some((candidate) => seoPagePath(candidate) === seoPagePath(page))).toBe(false);
      expect(existsSync(`public${seoHeroImage(page)}`)).toBe(true);
      expect(page.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
    expect(getSeoPage("features", "missing")).toBeUndefined();
    expect(getSeoPage("features", "../pricing")).toBeUndefined();
    expect(getSeoPage("solutions", "instagram-dm-automation")).toBeUndefined();
  });

  it("uses a different photograph for every detail page and collection hub", () => {
    const hubs = (["features", "solutions", "templates"] as const).map((collection) => ({ collection }));
    const targets = [...seoPages, ...hubs];
    const assets = targets.map(seoHeroAsset);
    expect(new Set(assets.map(({ src }) => src)).size).toBe(67);
    const hashes = assets.map((asset, index) => {
      expect(seoHeroImage(targets[index])).toBe(asset.src);
      expect(existsSync(`public${asset.src}`), asset.src).toBe(true);
      const metadata = "slug" in targets[index]
        ? seoPageMetadata(targets[index] as SeoPage)
        : seoCollectionMetadata(targets[index].collection);
      expect(metadata.openGraph).toMatchObject({ images: [{ url: asset.src, alt: asset.alt, width: 1536, height: 1024 }] });
      return createHash("sha256").update(readFileSync(`public${asset.src}`)).digest("hex");
    });
    expect(new Set(hashes).size).toBe(67);
    expect(() => seoHeroAsset({ collection: "features", slug: "missing" })).toThrow("Missing editorial hero scene");
  });

  it("includes each guide and collection once in the sitemap, excluding downloads", () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://linkar.in");
    const entries = sitemap();
    const urls = entries.map(({ url }) => url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const page of seoPages) {
      expect(entries.find(({ url }) => url === `https://linkar.in${seoPagePath(page)}`)).toMatchObject({ lastModified: "2026-10-13" });
    }
    for (const collection of Object.keys(seoCollections)) expect(urls).toContain(`https://linkar.in/${collection}`);
    expect(urls.some((url) => url.endsWith("/recipe"))).toBe(false);
    for (const collection of ["features", "solutions", "templates"] as const) {
      expect(seoCollectionMetadata(collection).alternates?.canonical).toBe(`/${collection}`);
      const data = seoCollectionStructuredData(collection);
      expect(data[0]).toMatchObject({ "@type": "CollectionPage" });
      expect(data[0].mainEntity?.itemListElement).toHaveLength(getSeoPages(collection).length);
      expect(data[1]).toMatchObject({ "@type": "BreadcrumbList" });
    }
  });

  it("makes the full inventory public on one canonical host with proxy coverage", () => {
    const proxy = readFileSync("proxy.ts", "utf8");
    for (const path of [...Object.keys(seoCollections).map((collection) => `/${collection}`), ...seoPages.map(seoPagePath)]) {
      expect(isProtectedAppPath(path)).toBe(false);
      expect(resolveHostRedirect("linkar.in", path)).toBeNull();
      for (const host of ["app.linkar.in", "admin.linkar.in"]) expect(resolveHostRedirect(host, path)).toEqual({ target: "marketing", pathname: path });
      expect(marketingHref(path, "https://linkar.in")).toBe(`https://linkar.in${path}`);
      expect(proxy).toContain(`"/${path.split("/")[1]}/:path*"`);
    }
  });

  it("provides unique canonicals and social metadata without invented proof", () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://linkar.in");
    for (const page of seoPages) {
      const metadata = seoPageMetadata(page);
      expect(metadata.alternates?.canonical).toBe(seoPagePath(page));
      expect(metadata.openGraph).toMatchObject({ url: seoPagePath(page), title: `${page.label} · Linkar`, description: page.description });
      expect(metadata.twitter).toMatchObject({ card: "summary_large_image", description: page.description });
      const data = seoStructuredData(page);
      expect(data[1]).toMatchObject({ "@type": "BreadcrumbList" });
      expect(data[1].itemListElement?.[2]).toMatchObject({ item: `https://linkar.in${seoPagePath(page)}` });
      expect(JSON.stringify(data)).not.toMatch(/"aggregateRating"|"@type":"(?:Review|FAQPage|HowTo)"/);
    }
  });
});

describe("downloadable workflow recipes", () => {
  it("returns each exact recipe with safe download headers and no search indexing", async () => {
    for (const page of getSeoPages("templates")) {
      const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ slug: page.slug }) });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-disposition")).toBe(`attachment; filename="linkar-${page.slug}.md"`);
      expect(response.headers.get("x-robots-tag")).toBe("noindex");
      const text = await response.text();
      expect(text).toBe(seoRecipeMarkdown(page));
      expect(text).toContain(page.example.reply);
      expect(text).toContain(page.steps[0][1]);
      expect(text).toContain(page.topic === "facebook" ? "public comment replies" : "Instagram");
    }
  });

  it("rejects unknown or cross-collection download names", async () => {
    for (const slug of ["missing", "content-creators", "../pricing", "test\r\nheader"]) {
      const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ slug }) });
      expect(response.status).toBe(404);
      expect(response.headers.get("content-disposition")).toBeNull();
    }
  });
});
