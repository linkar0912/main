// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSeoPages, seoCollections, seoPages, seoTopics, topicGuides, type SeoCollection, type SeoPage } from "@/src/content/seo";
import { seoHeroAsset } from "@/src/lib/seo-hero-assets";
import {
  buildDetailLayouts,
  detailLayout,
  heavySurfaces,
  hubImageSlots,
  layoutVariants,
  MIN_PAGES_PER_VARIANT,
  pageNavItems,
  requiredImageSlots,
  sectionIds,
  sectionSurface,
  seoPager,
  variantDistribution,
  type DetailLayout,
  type LayoutRole,
} from "./seo-layout";
import { SeoCollectionPage, SeoLandingPage } from "./seo-page";
import { topicLine, topicVisuals, type TopicLineField } from "./seo-theme";

vi.mock("next/navigation", () => ({ usePathname: () => "/features" }));

/* A plain img keeps the real src, so the test can tell hero photos from image slots. */
vi.mock("next/image", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ src, alt, sizes, className }: { src: string | { src: string }; alt: string; sizes?: string; className?: string }) =>
      createElement("img", { src: typeof src === "string" ? src : src.src, alt, sizes, className }),
  };
});

const collections: readonly SeoCollection[] = ["features", "solutions", "templates"];
const roles = Object.keys(layoutVariants) as LayoutRole[];

/** Text without any whitespace: sections may split a paragraph across elements. */
const squash = (text: string) => text.replace(/\s+/g, "");

function pageKey(page: SeoPage) {
  return `${page.collection}/${page.slug}`;
}

function variantsOf(layout: DetailLayout): string[] {
  return roles.flatMap((role) => role === "extras" ? layout.extras.map((extra) => `extras:${extra}`) : [`${role}:${layout[role]}`]);
}

/** The fewest pages that between them render every variant of every role, plus a Facebook page and a recipe. */
function coveringPages(): SeoPage[] {
  const missing = new Set(roles.flatMap((role) => layoutVariants[role].map((variant) => `${role}:${variant}`)));
  const chosen: SeoPage[] = [];
  while (missing.size > 0) {
    let best: SeoPage | null = null;
    let bestGain = 0;
    for (const page of seoPages) {
      const gain = variantsOf(detailLayout(page)).filter((key) => missing.has(key)).length;
      if (gain > bestGain) { best = page; bestGain = gain; }
    }
    if (!best) throw new Error(`No page renders ${[...missing].join(", ")}`);
    chosen.push(best);
    variantsOf(detailLayout(best)).forEach((key) => missing.delete(key));
  }
  for (const needs of [(page: SeoPage) => page.topic === "facebook", (page: SeoPage) => page.collection === "templates"]) {
    if (!chosen.some(needs)) chosen.push(seoPages.find(needs)!);
  }
  return chosen;
}

/** Every piece of editorial copy the page must keep visible. */
function editorialStrings(page: SeoPage): string[] {
  const guide = topicGuides[page.topic];
  return [
    page.label, page.headline, page.description, page.intro,
    ...page.benefits.flat(), ...page.steps.flat(),
    page.example.incoming, page.example.reply, page.example.note,
    ...page.tip, ...page.faq,
    guide.title, ...guide.paragraphs,
    "Which account do I need?", "Can I try Linkar for free?", "Do I need to write code?",
  ];
}

const heroPhotoPattern = /^\/marketing\/seo\/(?:features|solutions|templates)(?:\/[^/]+)?\.webp$/;

function expectNoHeroPhotoOutsideHero(container: HTMLElement) {
  for (const img of Array.from(container.querySelectorAll("img"))) {
    const src = img.getAttribute("src") ?? "";
    if (src.includes("/slots/")) continue;
    if (heroPhotoPattern.test(src)) expect(img.closest("[data-hero]"), `${src} outside the hero`).not.toBeNull();
  }
}

describe("SEO detail pages", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { callback(performance.now()); return 1; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const pages = coveringPages();

  it("covers every variant of every role with the rendered pages", () => {
    const rendered = new Set(pages.flatMap((page) => variantsOf(detailLayout(page))));
    for (const role of roles) for (const variant of layoutVariants[role]) expect(rendered.has(`${role}:${variant}`), `${role}:${variant}`).toBe(true);
  });

  it.each(pages.map((page) => [pageKey(page), page] as const))("renders %s completely", (_key, page) => {
    const layout = detailLayout(page);
    const { container } = render(<SeoLandingPage page={page} />);
    const main = container.querySelector("main")!;

    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1")?.closest("[data-hero]")).not.toBeNull();

    // Every section the layout places carries its fixed id.
    for (const key of layout.order) {
      const id = sectionIds[key];
      if (id) expect(main.querySelector(`#${id}`), `#${id} for ${key}`).not.toBeNull();
    }

    // The on-page nav follows the layout order and every link lands on a real section.
    const nav = container.querySelector('nav[aria-label="On this page"]')!;
    const hashes = Array.from(nav.querySelectorAll('a[href^="#"]'), (link) => link.getAttribute("href"));
    expect(hashes).toEqual(pageNavItems(layout).map((item) => `#${item.id}`));
    for (const hash of hashes) expect(main.querySelector(hash!), hash!).not.toBeNull();
    for (const link of Array.from(container.querySelectorAll('a[href^="#"]'))) {
      const hash = link.getAttribute("href")!;
      if (hash.length > 1) expect(container.querySelector(hash), `${hash} target`).not.toBeNull();
    }

    // All editorial copy stays on the page.
    const text = squash(main.textContent ?? "");
    for (const copy of editorialStrings(page)) expect(text.includes(squash(copy)), copy).toBe(true);
    expect(text.includes(squash(page.example.next)), page.example.next).toBe(true);

    expect(container.innerHTML.includes("\u2014")).toBe(false);
    expectNoHeroPhotoOutsideHero(container);

    // Every image slot drawn on the page is one the image script knows about.
    const declared = new Set(requiredImageSlots(page).map((slot) => slot.id));
    for (const slot of Array.from(container.querySelectorAll("[data-image-slot]"))) {
      expect(declared.has(slot.getAttribute("data-image-slot")!), slot.getAttribute("data-image-slot")!).toBe(true);
    }

    // Pager: previous and next guide in the same collection.
    const { previous, next: following } = seoPager(page);
    expect(main.querySelector(`a[href="/${previous.collection}/${previous.slug}"][rel="prev"]`)).not.toBeNull();
    expect(main.querySelector(`a[href="/${following.collection}/${following.slug}"][rel="next"]`)).not.toBeNull();

    if (page.collection === "templates") {
      expect(container.querySelector(`a[href="/templates/${page.slug}/recipe"][download]`)).not.toBeNull();
    }
  });

  it.each(seoPages.filter((page) => page.topic === "facebook").map((page) => [pageKey(page), page] as const))("keeps %s to public Page replies", (_key, page) => {
    const { container } = render(<SeoLandingPage page={page} />);
    // The hero's trust row drops the Instagram API lockup on a Facebook Page guide.
    const hero = container.querySelector("[data-hero]")!;
    expect(hero.querySelector('[aria-label="Why people trust Linkar"]')).not.toBeNull();
    expect(hero.textContent).not.toContain("Instagram API");
    const main = container.querySelector("main")!.cloneNode(true) as HTMLElement;
    // Channel cards describe Instagram too, related links and the pager name other guides, and the JSON-LD repeats copy.
    main.querySelectorAll('#channels, #related, [aria-labelledby="pager-title"], script').forEach((node) => node.remove());
    expect(main.querySelectorAll("[data-side]")).toHaveLength(0);
    let text = main.textContent ?? "";
    for (const copy of editorialStrings(page)) text = text.split(copy).join(" ");
    expect(text).not.toMatch(/\bDMs?\b|private repl|direct message|Messenger/i);
  });
});

describe("SEO layout engine", () => {
  it("gives the same page the same layout every time", () => {
    for (const collection of collections) {
      const pages = getSeoPages(collection);
      const first = buildDetailLayouts(pages);
      const second = buildDetailLayouts(pages.map((page) => ({ ...page })));
      expect([...second.entries()]).toEqual([...first.entries()]);
      for (const page of pages) expect(detailLayout({ ...page })).toEqual(first.get(page.slug));
    }
  });

  it("uses every variant of every role on at least two pages of each collection", () => {
    for (const collection of collections) {
      const distribution = variantDistribution(buildDetailLayouts(getSeoPages(collection)).values());
      for (const role of roles) for (const variant of layoutVariants[role]) {
        expect(distribution[role][variant], `${collection} ${role}:${variant}`).toBeGreaterThanOrEqual(MIN_PAGES_PER_VARIANT);
      }
    }
  });

  it("orders sections and never stacks matching surfaces", () => {
    for (const page of seoPages) {
      const layout = detailLayout(page);
      const { order } = layout;
      expect(order.slice(0, 2)).toEqual(["overview", "steps"]);
      expect(order.slice(-5)).toEqual(["notes", "faq", "related", "pager", "cta"]);
      expect(order.filter((key) => key === "benefits" || key === "example")).toHaveLength(2);
      expect(layout.extras.length).toBeGreaterThanOrEqual(1);
      expect(layout.extras.length).toBeLessThanOrEqual(2);
      expect(new Set(layout.extras).size).toBe(layout.extras.length);
      const surfaces = order.map((key) => sectionSurface(layout, key));
      // At most one full-width photo besides the hero, and never straight after a full-bleed hero.
      expect(surfaces.filter((surface) => surface === "photo").length, `${pageKey(page)} photo sections`).toBeLessThanOrEqual(1);
      expect(layout.extras.includes("photo") && layout.cta === "photo", `${pageKey(page)} photo extra and photo CTA`).toBe(false);
      if (layout.hero === "fullbleed") expect(surfaces[0], `${pageKey(page)} photo after a full-bleed hero`).not.toBe("photo");
      order.forEach((key, index) => {
        if (index === 0) return;
        if (key.startsWith("extra:")) expect(order[index - 1].startsWith("extra:"), `${pageKey(page)} extras side by side`).toBe(false);
        if (surfaces[index] !== "canvas") expect(surfaces[index], `${pageKey(page)} ${order[index - 1]} > ${key}`).not.toBe(surfaces[index - 1]);
        if (index >= 2) expect(surfaces.slice(index - 2, index + 1).every((surface) => surface === "canvas"), `${pageKey(page)} three canvas sections`).toBe(false);
        if (index >= 2) expect(surfaces.slice(index - 2, index + 1).every((surface) => heavySurfaces.has(surface)), `${pageKey(page)} three dark or saturated sections`).toBe(false);
      });
    }
  });

  it("asks only for image slots, never the hero photo", () => {
    for (const page of seoPages) {
      const hero = seoHeroAsset(page).src;
      for (const slot of requiredImageSlots(page)) {
        expect(slot.src.startsWith("/marketing/seo/slots/")).toBe(true);
        expect(slot.src).not.toBe(hero);
      }
    }
    for (const collection of collections) expect(hubImageSlots(collection)).toHaveLength(getSeoPages(collection).length);
  });
});

describe("SEO topic headlines", () => {
  const fields: readonly [TopicLineField, (layout: DetailLayout) => boolean][] = [
    ["inboxTitles", () => true],
    ["statementLines", (layout) => layout.extras.includes("photo")],
    ["compareTitles", (layout) => layout.extras.includes("compare")],
  ];

  it("gives every topic three short lines per field, without numbers or em dashes", () => {
    for (const visual of Object.values(topicVisuals)) {
      for (const [field] of fields) {
        const lines = visual[field].map((line) => (typeof line === "string" ? line : line.join(" ")));
        expect(new Set(lines).size).toBe(3);
        for (const line of lines) expect(line).not.toMatch(/[0-9\u2014]/);
      }
    }
  });

  it("varies the lines between pages on the same topic in a collection", () => {
    for (const collection of collections) {
      for (const [field, shows] of fields) {
        const groups = new Map<string, string[]>();
        for (const page of getSeoPages(collection)) {
          if (!shows(detailLayout(page))) continue;
          const line = topicLine(page, field);
          expect(topicLine({ ...page }, field)).toEqual(line);
          groups.set(page.topic, [...(groups.get(page.topic) ?? []), typeof line === "string" ? line : line.join(" ")]);
        }
        for (const [topic, lines] of groups) {
          expect(new Set(lines).size, `${collection} ${topic} ${field}`).toBe(Math.min(lines.length, 3));
        }
      }
    }
  });
});

describe("SEO collection hubs", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { callback(performance.now()); return 1; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each(collections.map((collection) => [collection] as const))("renders the %s hub with working anchors", (collection) => {
    const hub = seoCollections[collection];
    const pages = getSeoPages(collection);
    const { container } = render(<SeoCollectionPage collection={collection} />);
    const main = container.querySelector("main")!;

    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(main.querySelector("#browse")).not.toBeNull();
    const topics = [...new Set(pages.map((page) => page.topic))];
    for (const topic of topics) expect(main.querySelector(`#${topic}`), topic).not.toBeNull();

    const topicNav = container.querySelector('nav[aria-label="Browse by topic"]')!;
    const topicLinks = Array.from(topicNav.querySelectorAll("a"), (link) => link.getAttribute("href"));
    expect(topicLinks.sort()).toEqual(topics.map((topic) => `#${topic}`).sort());
    for (const link of Array.from(container.querySelectorAll('a[href^="#"]'))) {
      const hash = link.getAttribute("href")!;
      if (hash.length > 1) expect(container.querySelector(hash), `${hash} target`).not.toBeNull();
    }
    const tabs = container.querySelector('nav[aria-label="Explore Linkar"]')!;
    expect(Array.from(tabs.querySelectorAll("a"), (link) => link.getAttribute("href"))).toEqual(["/features", "/solutions", "/templates"]);
    expect(tabs.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe(`/${collection}`);

    const text = squash(main.textContent ?? "");
    for (const copy of [hub.headline, hub.description, hub.intro, ...hub.guidance.flat(), ...topics.map((topic) => seoTopics[topic])]) {
      expect(text.includes(squash(copy)), copy).toBe(true);
    }
    for (const page of pages) {
      expect(main.querySelector(`a[href="/${page.collection}/${page.slug}"]`), page.slug).not.toBeNull();
    }

    expect(container.innerHTML.includes("\u2014")).toBe(false);
    expectNoHeroPhotoOutsideHero(container);
    const declared = new Set(hubImageSlots(collection).map((slot) => slot.id));
    for (const slot of Array.from(container.querySelectorAll("[data-image-slot]"))) {
      expect(declared.has(slot.getAttribute("data-image-slot")!), slot.getAttribute("data-image-slot")!).toBe(true);
    }
  });
});
