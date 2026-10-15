// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRelatedSeoPages, getSeoPages, seoCollections, seoPagePath, seoPages, seoTopics, topicGuides, type SeoCollection, type SeoPage } from "@/src/content/seo";
import { seoHeroAsset } from "@/src/lib/seo-hero-assets";
import {
  buildDetailLayouts,
  detailLayout,
  heavySurfaces,
  layoutVariants,
  MIN_PAGES_PER_VARIANT,
  pageNavItems,
  sectionIds,
  sectionSurface,
  seoPager,
  variantDistribution,
  type DetailLayout,
  type LayoutRole,
} from "./seo-layout";
import { SeoCollectionPage, SeoLandingPage } from "./seo-page";
import { topicLine, topicVisuals, type TopicLineField } from "./seo-theme";
import { facebookRepliesLinkText, instagramFeaturesLinkText } from "./sections/extras/channels";
import { faqItems, genericQuestion, genericQuestions } from "./sections/faq/copy";
import { relatedSub } from "./sections/related/copy";

vi.mock("next/navigation", () => ({ usePathname: () => "/features" }));

/* A plain img keeps the real src, so the tests can tell the hero photo from any other picture. */
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

/** The questions every page may add after its own; each page shows exactly one. */
const genericQuestionTitles = ["Which account do I need?", "Can I try Linkar for free?", "Do I need to write code?"];

/** Every piece of editorial copy the page must keep visible. */
function editorialStrings(page: SeoPage): string[] {
  const guide = topicGuides[page.topic];
  return [
    page.label, page.headline, page.description, page.intro,
    ...page.benefits.flat(), ...page.steps.flat(),
    page.example.incoming, page.example.reply, page.example.note,
    ...page.tip, ...page.faq,
    guide.title, ...guide.paragraphs,
    genericQuestion(page)[0],
  ];
}

/** The hero photo is the only picture on a page: every other visual is Linkar UI drawn in code. */
function expectOnlyHeroPhoto(container: HTMLElement, hero: string) {
  const pictures = Array.from(container.querySelectorAll("img, picture, video, image"));
  expect(pictures.map((node) => node.getAttribute("src") ?? node.getAttribute("href"))).toEqual([hero]);
  expect(pictures[0].closest("[data-hero]"), `${hero} outside the hero`).not.toBeNull();
  for (const node of Array.from(container.querySelectorAll("[style]"))) {
    expect(node.getAttribute("style"), "inline background picture").not.toMatch(/url\(/);
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
    // The H1 names the page: its label leads the headline.
    expect(container.querySelector("h1")?.textContent).toContain(page.label);

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

    // The FAQ: the page's own question and one generic question, never all three.
    const questions = Array.from(main.querySelectorAll("#questions summary"), (summary) => summary.textContent?.trim());
    expect(questions).toEqual([page.faq[0], genericQuestion(page)[0]].map((question) => expect.stringContaining(question)));
    for (const other of genericQuestionTitles.filter((question) => question !== genericQuestion(page)[0])) {
      expect(text.includes(squash(other)), other).toBe(false);
    }

    expect(container.innerHTML.includes("\u2014")).toBe(false);

    // Pager: previous and next guide in the same collection.
    const { previous, next: following } = seoPager(page);
    expect(main.querySelector(`a[href="/${previous.collection}/${previous.slug}"][rel="prev"]`)).not.toBeNull();
    expect(main.querySelector(`a[href="/${following.collection}/${following.slug}"][rel="next"]`)).not.toBeNull();

    if (page.collection === "templates") {
      expect(container.querySelector(`a[href="/templates/${page.slug}/recipe"][download]`)).not.toBeNull();
    }
  });

  it.each(pages.map((page) => [pageKey(page), page] as const))("shows no picture on %s besides the hero photo", (_key, page) => {
    const { container } = render(<SeoLandingPage page={page} />);
    expectOnlyHeroPhoto(container, seoHeroAsset(page).src);
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

  it("words the channel card links per collection and keeps the head term off them", () => {
    const facebookFeature = "/features/facebook-comment-auto-reply";
    const facebookAnchors: string[] = [];
    for (const collection of collections) {
      // A page that shows the channel cards and links out to the Facebook Page reply feature.
      const page = getSeoPages(collection).find((candidate) => detailLayout(candidate).extras.includes("channels") && seoPagePath(candidate) !== facebookFeature);
      expect(page, collection).toBeDefined();
      const { container, unmount } = render(<SeoLandingPage page={page!} />);
      const cards = container.querySelector("#channels");
      expect(cards, pageKey(page!)).not.toBeNull();
      const facebook = cards!.querySelector(`a[href="${facebookFeature}"]`);
      const instagram = cards!.querySelector('a[href="/features"]');
      expect(facebook?.textContent, pageKey(page!)).toBe(`Learn more ${facebookRepliesLinkText[collection]}`);
      expect(instagram?.textContent, pageKey(page!)).toBe(`Learn more ${instagramFeaturesLinkText}`);
      // "Instagram automation" anchors sitewide point at the homepage, never at a hub.
      expect(instagram?.textContent).not.toMatch(/instagram automation/i);
      expect(facebook?.textContent).not.toMatch(/[0-9\u2014]/);
      facebookAnchors.push(facebook!.textContent!);
      unmount();
    }
    expect(new Set(facebookAnchors).size).toBe(collections.length);
    expect(facebookAnchors).not.toContain("Learn more about Facebook Page comment replies");
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
    // The H1 starts with the hub's label, then the headline. The homepage owns
    // "Instagram automation", so the solutions hub names workflows instead.
    expect(container.querySelector("h1")?.textContent).toMatch(/^Instagram (and Facebook automation|workflows) /);
    expect(container.querySelector("h1")?.textContent).toContain(hub.headline);
    expect(main.querySelector("#browse")).not.toBeNull();

    // The intro closes with one link to the homepage, anchored on the head term.
    const homeLinks = Array.from(main.querySelectorAll('#browse a[href="/"]'));
    expect(homeLinks.map((link) => link.textContent)).toEqual(["Instagram automation"]);
    expect(homeLinks[0].closest("p")?.textContent).toMatch(/Linkar’s Instagram automation\b[^.]*\.$/);
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
  });

  it.each(collections.map((collection) => [collection] as const))("shows no picture on the %s hub besides the hero photo", (collection) => {
    const { container } = render(<SeoCollectionPage collection={collection} />);
    expectOnlyHeroPhoto(container, seoHeroAsset({ collection }).src);
  });
});

describe("SEO shared copy", () => {
  it("gives every page its own question plus one generic question, the same on every build", () => {
    for (const page of seoPages) {
      const items = faqItems(page);
      expect(items).toHaveLength(2);
      expect(items[0]).toBe(page.faq);
      expect(genericQuestionTitles).toContain(items[1][0]);
      expect(faqItems({ ...page })[1][0]).toBe(items[1][0]);
    }
  });

  it("shows each generic question on about a third of the pages, in every collection", () => {
    const counts = new Map<string, number>();
    for (const page of seoPages) counts.set(genericQuestion(page)[0], (counts.get(genericQuestion(page)[0]) ?? 0) + 1);
    expect([...counts.keys()].sort()).toEqual([...genericQuestionTitles].sort());
    for (const [question, count] of counts) {
      expect(count, question).toBeGreaterThanOrEqual(Math.floor(seoPages.length / 3));
      expect(count, question).toBeLessThanOrEqual(Math.ceil(seoPages.length / 3));
    }
    for (const collection of collections) {
      expect(new Set(getSeoPages(collection).map((page) => genericQuestion(page)[0])).size, collection).toBe(genericQuestionTitles.length);
    }
  });

  it("calls a Facebook Page guide a recipe only on templates", () => {
    for (const page of seoPages.filter((candidate) => candidate.topic === "facebook")) {
      const [question, answer] = genericQuestions(page)[0];
      expect(question).toBe("Which account do I need?");
      expect(typeof answer).toBe("string");
      if (page.collection === "templates") expect(answer).toMatch(/\brecipe\b/);
      else expect(answer).not.toMatch(/recipe/i);
    }
  });

  it("writes the related intro for each collection, never the old shared line", () => {
    for (const page of seoPages) {
      const related = getRelatedSeoPages(page);
      if (related.length === 0) continue;
      const sub = relatedSub(page, related);
      expect(sub).not.toContain("picked to go with");
      expect(sub.toLowerCase()).toContain(page.label.toLowerCase());
      expect(sub).not.toMatch(/[0-9\u2014]/);
      // The same label and links read differently in each collection.
      expect(new Set(collections.map((collection) => relatedSub({ ...page, collection }, related))).size).toBe(collections.length);
    }
    const recipe = getSeoPages("templates")[0];
    expect(relatedSub(recipe, getRelatedSeoPages(recipe))).toContain(`adapt the ${recipe.label}`);
    const solution = getSeoPages("solutions")[0];
    expect(relatedSub(solution, getRelatedSeoPages(solution).slice(0, 1))).toMatch(/^One (guide|recipe) that helps you put /);
  });

  it("counts the recipes on the templates hub from the collection", () => {
    expect(seoCollections.templates.description).toContain(`Browse ${getSeoPages("templates").length} `);
  });
});
