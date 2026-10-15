// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seoCollections, seoPages, type SeoCollection, type SeoPage } from "@/src/content/seo";
import { seoHeroAsset } from "@/src/lib/seo-hero-assets";
import { detailLayout, type HeroVariant } from "../../seo-layout";
import { heroVariants, SeoHubHero } from "./index";

/* A plain img that records how next/image was asked to load the photo. */
vi.mock("next/image", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ src, alt, sizes, preload, priority, fetchPriority, loading }: {
      src: string; alt: string; sizes?: string; preload?: boolean; priority?: boolean; fetchPriority?: string; loading?: string;
    }) => createElement("img", {
      src, alt, sizes, loading,
      "data-preload": preload ? "true" : undefined,
      "data-priority": priority ? "true" : undefined,
      "data-fetch-priority": fetchPriority,
    }),
  };
});

/** The H1 kicker each hub carries: the hub's label, in full. */
const hubKickers: Record<SeoCollection, string> = {
  features: "Instagram and Facebook automation features",
  solutions: "Instagram workflows for creators and businesses",
  templates: "Instagram and Facebook automation templates",
};

const collections = Object.keys(seoCollections) as SeoCollection[];

function renderDetailHero(page: SeoPage) {
  const Hero = heroVariants[detailLayout(page).hero];
  return render(<Hero page={page} />).container;
}

type ImageLoading = { preload: boolean; priority: boolean; fetchPriority: string | null; loading: string | null };

function heroImage(container: HTMLElement): ImageLoading {
  const images = container.querySelectorAll("[data-hero] img");
  expect(images).toHaveLength(1);
  const image = images[0];
  return {
    preload: image.getAttribute("data-preload") === "true",
    priority: image.getAttribute("data-priority") === "true",
    fetchPriority: image.getAttribute("data-fetch-priority"),
    loading: image.getAttribute("loading"),
  };
}

afterEach(cleanup);

describe("SEO detail hero H1", () => {
  it.each(seoPages.map((page) => [`${page.collection}/${page.slug}`, page] as const))("leads with the page label on %s", (_key, page) => {
    const container = renderDetailHero(page);
    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    const heading = headings[0];

    // The label is the kicker, first inside the H1, and the headline follows after a space.
    const kicker = heading.querySelector("[data-kicker]");
    expect(kicker?.textContent).toBe(page.label);
    expect(heading.firstElementChild).toBe(kicker);
    expect(heading.textContent?.startsWith(`${page.label} `)).toBe(true);
    expect(heading.textContent?.replace(/\s+/g, " ")).toContain(page.headline);

    // The breadcrumb keeps Home and the collection, and no longer repeats the page.
    const crumbs = container.querySelector('nav[aria-label="Breadcrumb"]')!;
    expect(Array.from(crumbs.querySelectorAll("a"), (link) => link.getAttribute("href"))).toEqual(["/", `/${page.collection}`]);
    expect(crumbs.querySelector('[aria-current="page"]')).toBeNull();
    expect(crumbs.textContent).not.toContain(page.label);
  });

  it("covers every detail hero variant", () => {
    const variants = new Set<HeroVariant>(seoPages.map((page) => detailLayout(page).hero));
    expect([...variants].sort()).toEqual(Object.keys(heroVariants).sort());
  });
});

describe("SEO hub hero H1", () => {
  it.each(collections.map((collection) => [collection] as const))("leads with the hub label on the %s hub", (collection) => {
    const { container } = render(<SeoHubHero collection={collection} />);
    const heading = container.querySelector("h1")!;
    const kicker = heading.querySelector("[data-kicker]");
    expect(kicker?.textContent).toBe(hubKickers[collection]);
    expect(heading.firstElementChild).toBe(kicker);
    expect(heading.textContent?.replace(/\s+/g, " ")).toBe(`${hubKickers[collection]} ${seoCollections[collection].headline}`);
    // The label is not repeated as a separate pill outside the H1.
    const hero = container.querySelector("[data-hero]")!;
    expect(hero.textContent?.split(hubKickers[collection])).toHaveLength(2);
    expect(container.querySelector('nav[aria-label="Breadcrumb"] [aria-current="page"]')?.textContent).toBe(seoCollections[collection].label);
  });

  it("leaves the head term to the homepage on the solutions hub", () => {
    const { container } = render(<SeoHubHero collection="solutions" />);
    // The homepage owns "Instagram automation"; this hub names its audience intent instead.
    expect(container.querySelector("h1")?.textContent).not.toMatch(/instagram automation/i);
    expect(seoCollections.solutions.title).toBe("Instagram Workflows for Creators & Businesses · Linkar");
  });
});

describe("SEO hero photo loading", () => {
  /** Next 16: preload adds a head link; fetchPriority and loading tune the img itself. The docs say never to combine them. */
  const expected: Record<HeroVariant | "hub", ImageLoading> = {
    split: { preload: true, priority: false, fetchPriority: null, loading: null },
    fullbleed: { preload: false, priority: false, fetchPriority: "high", loading: "eager" },
    centered: { preload: false, priority: false, fetchPriority: null, loading: "eager" },
    hub: { preload: true, priority: false, fetchPriority: null, loading: null },
  };

  it.each(seoPages.map((page) => [`${page.collection}/${page.slug}`, page] as const))("loads the %s photo to suit its hero", (_key, page) => {
    const container = renderDetailHero(page);
    const image = heroImage(container);
    expect(image.preload && image.fetchPriority !== null, "preload with fetchPriority").toBe(false);
    expect(image.preload && image.loading !== null, "preload with loading").toBe(false);
    expect(image.priority, "deprecated priority").toBe(false);
    expect(image).toEqual(expected[detailLayout(page).hero]);
    expect(container.querySelector("[data-hero] img")?.getAttribute("src")).toBe(seoHeroAsset(page).src);
  });

  it.each(collections.map((collection) => [collection] as const))("preloads the %s hub photo without fetchPriority", (collection) => {
    const { container } = render(<SeoHubHero collection={collection} />);
    expect(heroImage(container)).toEqual(expected.hub);
  });
});
