import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { seoPages } from "@/src/content/seo";
import { exampleContext, exampleDrawsPost, incomingFor, triggerLabel } from "../../seo-example";
import { detailLayout, pageCoin } from "../../seo-layout";
import { OverviewZigzag } from "./zigzag";
import { artworkHeadline, ZigzagVisual, zigzagLook, zigzagSender } from "./zigzag-visual";

const decode = (html: string) => html.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
const count = (text: string, part: string) => text.split(part).length - 1;

/* Any page can draw the zigzag as layouts change, so every page is checked. */
describe.each(seoPages.map((page) => [`${page.collection}/${page.slug}`, page] as const))("overview zigzag on %s", (_key, page) => {
  it("draws the square in code, hidden from assistive tech, with nothing to focus", () => {
    const html = renderToStaticMarkup(<ZigzagVisual page={page} flip={false} />);
    expect(html.startsWith("<div")).toBe(true);
    expect(html.slice(0, html.indexOf(">"))).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<img|data-image-slot|background-image|<a\s|<button|tabindex/);
    expect(decode(html)).toContain(triggerLabel(page));
  });

  it("keeps to plain product language", () => {
    const text = decode(renderToStaticMarkup(<OverviewZigzag page={page} />)).replace(/<[^>]+>/g, " ");
    // No em dash (written as an escape, since the branding check forbids the character in source).
    expect(text.includes("\u2014")).toBe(false);
    expect(text).not.toMatch(/\b(payload|recipient|webhook)s?\b/i);
  });

  it("sets up the request without repeating it: the float carries the message", () => {
    const html = decode(renderToStaticMarkup(<ZigzagVisual page={page} />));
    const handle = zigzagSender(page);
    const incoming = incomingFor(page);
    if (exampleContext(page) !== "inbox") return;
    // The new conversation names its sender once (not again in Notes or older rows) and leaves the words to the float.
    expect(count(html, `>${handle}<`)).toBe(1);
    expect(html).toContain("New message");
    if (incoming.kind === "quote" && !incoming.keyword) expect(html).not.toContain(incoming.text);
    // A word sent from a post shows the post asking for it.
    if (exampleDrawsPost(page)) expect(html).toContain(`DM us <b>${incoming.keyword}</b>`);
  });

  it("gives the post a short headline and never yellow type on a yellow panel", () => {
    const headline = artworkHeadline(page);
    expect(headline.length).toBeGreaterThan(0);
    expect(headline.length).toBeLessThanOrEqual(22);
    const look = zigzagLook(page);
    expect(look.panel === "yellow" && look.art === "yellow").toBe(false);
  });
});

describe("zigzag panels across the pages that draw them", () => {
  const pages = seoPages.filter((page) => detailLayout(page).overview === "zigzag");

  it("deals the five panel tones evenly", () => {
    const tally = new Map<string, number>();
    for (const page of pages) tally.set(zigzagLook(page).panel, (tally.get(zigzagLook(page).panel) ?? 0) + 1);
    const counts = [...tally.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("floats the same person's request that tops the square's inbox", () => {
    for (const page of pages) {
      const html = decode(renderToStaticMarkup(<OverviewZigzag page={page} />));
      if (exampleContext(page) === "inbox") expect(count(html, `>${zigzagSender(page)}<`), page.slug).toBe(2);
    }
  });

  it("never shows the same sender on two pages", () => {
    const instagram = pages.filter((page) => page.topic !== "facebook").map(zigzagSender);
    expect(new Set(instagram).size).toBe(instagram.length);
  });

  it("never gives two pages on one topic the same scene, side and panel", () => {
    const scene = (page: (typeof pages)[number]) => `${exampleContext(page)}:${exampleDrawsPost(page)}:${zigzagLook(page).frame}`;
    const seen = new Set<string>();
    for (const page of pages) {
      const key = `${page.topic}/${scene(page)}/${pageCoin(page, "overview")}/${zigzagLook(page).panel}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });
});
