import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { seoPages, type SeoPage } from "@/src/content/seo";
import { exampleContext, exampleDrawsPost, incomingFor, nextFor } from "../../seo-example";
import { detailLayout } from "../../seo-layout";
import { exampleVariants } from "./index";
import { headlineText, isReel, postArtCopy, twoLineLength } from "./post-art";

const variants = Object.keys(exampleVariants) as (keyof typeof exampleVariants)[];

/** Visible text of the markup: tags dropped, entities decoded, whitespace removed. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, "");
}

const squash = (text: string) => text.replace(/\s+/g, "");

function render(variant: keyof typeof exampleVariants, page: SeoPage): string {
  const Section = exampleVariants[variant];
  return renderToStaticMarkup(<Section page={page} />);
}

/*
 * Every variant can land on any page as layouts change, so each one is checked
 * against every page, not only the pages that use it today.
 */
describe.each(variants)("example/%s", (variant) => {
  it.each(seoPages.map((page) => [`${page.collection}/${page.slug}`, page] as const))("renders %s completely", (_key, page) => {
    const html = render(variant, page);
    const text = textOf(html);

    expect(html).toMatch(/<section[^>]+id="example"/);
    expect(html).toContain('aria-labelledby="conversation-title"');
    expect(html.match(/<h2/g)).toHaveLength(1);
    expect(html).not.toContain("<h1");
    expect(html).toContain("<figcaption");
    expect(html.includes("\u2014")).toBe(false);

    for (const copy of [page.example.incoming, page.example.reply, page.example.note]) expect(text, copy).toContain(squash(copy));
    // The next step reads as its exact sentence, even when it is drawn as a divider and a later message.
    expect(text, page.example.next).toContain(squash(page.example.next));

    // No photos anywhere: the post is drawn in code.
    expect(html).not.toMatch(/<img|data-image-slot|background-image/);

    // Only the phone draws post artwork, only this page's, and only when there is a post behind the message.
    const arts = [...html.matchAll(/<div[^>]+data-post-art="([^"]+)"[^>]*>/g)];
    if (variant === "phone") {
      expect(arts.every((match) => match[1] === `${page.collection}/${page.slug}`)).toBe(true);
      expect(arts.length > 0).toBe(exampleDrawsPost(page));
      // The artwork is decorative: hidden from assistive tech, with nothing focusable inside.
      for (const [tag] of arts) expect(tag).toContain('aria-hidden="true"');
      // Sized by its longest word and by its two most even lines, for the narrow column of a square post.
      for (const [tag] of arts) expect(tag).toMatch(/--art-word:\d+;--art-pair:\d+/);
      // A Story is drawn as a Story (in the context panel and as the thread's preview); everything else as a feed post.
      const formats = arts.map((match) => match[0].match(/data-format="([^"]+)"/)?.[1]);
      if (exampleContext(page) === "story") expect(formats).toEqual(["story", "story"]);
      else expect(formats.every((format) => format === "post")).toBe(true);
      // The comment landing on a feed post is drawn inside the artwork, on its own row, so it never covers the post's words.
      const feed = exampleContext(page) === "post" || exampleContext(page) === "page";
      expect(arts[0]?.[0].includes('data-overlay="true"') ?? false).toBe(feed && exampleDrawsPost(page));
    } else {
      expect(arts).toHaveLength(0);
    }

    // A step for you after the reply never sits inside the person's chat: it is an "In Linkar" note outside it.
    const next = nextFor(page);
    if (next.kind === "note" && next.tag === "Next" && variant !== "flow") expect(html).toContain("In Linkar");

    if (page.topic === "facebook") {
      expect(html).not.toContain("data-side");
      let visible = html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");
      for (const copy of [page.example.incoming, page.example.reply, page.example.note, page.example.next]) visible = visible.split(copy).join(" ");
      expect(visible).not.toMatch(/\bDMs?\b|private repl|direct message|Messenger/i);
    }
  });
});

/* The artwork's words read as real post copy and follow the site's text rules. */
describe("post art copy", () => {
  it.each(seoPages.filter(exampleDrawsPost).map((page) => [`${page.collection}/${page.slug}`, page] as const))("%s", (_key, page) => {
    for (const format of ["post", "story"] as const) {
      const copy = postArtCopy(page, format);
      const headline = headlineText(copy);
      const words = [copy.kicker, headline, copy.cta ? `${copy.cta.verb} ${copy.cta.word}` : "", copy.sticker ?? ""].join(" ");

      // Short and bold: a few words with one highlighted, never a sentence.
      expect(headline.length, headline).toBeLessThanOrEqual(22);
      expect(Math.max(...headline.split(/\s+/).map((word) => word.length)), headline).toBeLessThanOrEqual(10);
      expect(copy.headline.filter((part) => part.mark)).toHaveLength(1);
      expect(copy.kicker.length).toBeLessThanOrEqual(16);
      expect(headline).not.toMatch(/[{}*]/);

      expect(words).not.toMatch(/\u2014|\bpayload\b|\brecipient\b|\bwebhook\b/i);
      // No invented numbers: counts, prices or percentages.
      expect(words.replace(copy.cta?.word ?? "", "")).not.toMatch(/\d|[%₹$]/);

      // The request matches the one the person sends.
      const keyword = page.example.incoming.match(/\b[A-Z]{3,}(?:\s[A-Z]{3,})?\b/)?.[0];
      if (copy.cta && keyword) expect(copy.cta.word).toBe(keyword);
      // "DM us" marks the word to send with quotes, so the verb never runs into it; a comment request reads plainly.
      if (copy.cta) expect(copy.cta.quote).toBe(copy.cta.verb === "DM us");
      // A request word that names something other than what the post offers says it is how to ask for it.
      if (copy.cta) {
        const named = `${copy.kicker} ${headline}`.toLowerCase().includes(copy.cta.word.toLowerCase());
        if (["GUIDE", "CHECKLIST", "TEMPLATE"].includes(copy.cta.word)) expect(copy.cta.tail).toBe(named ? null : "for it");
        if (named) expect(copy.cta.tail).toBeNull();
      }
      // A Facebook Page post never asks for a DM.
      if (page.topic === "facebook") expect(words).not.toMatch(/\bDMs?\b|private repl|direct message|Messenger/i);
      // Only a Story carries a sticker; only a feed post carries the request pill.
      expect(copy.sticker !== null).toBe(format === "story");
      if (format === "story") expect(copy.cta).toBeNull();
      // At thumbnail size the sticker shrinks to something readable: the request word or the mention.
      if (format === "story") {
        const keyword = incomingFor(page).keyword;
        if (exampleContext(page) === "story") expect(copy.stickerShort).not.toBeNull();
        if (copy.stickerShort) expect(copy.stickerShort.length).toBeLessThanOrEqual(20);
        if (keyword) expect(copy.stickerShort).toBe(`Reply ${keyword}`);
      }
      // The post names one thing: a kicker offering a guide comes with a headline about the guide.
      if (/\bguide\b/i.test(copy.kicker)) expect(headline).toMatch(/\bguide\b/i);
      expect(["corner", "center"]).toContain(copy.layout);
    }
  });

  it("splits a headline into its two most even lines", () => {
    expect(twoLineLength("Something new")).toBe(9);
    expect(twoLineLength("Enter to win")).toBe(6);
    expect(twoLineLength("The template pack")).toBe(12);
    expect(twoLineLength("Hello")).toBe(5);
  });

  it("asks for the guide by its word when the post offers a checklist", () => {
    const page = seoPages.find((candidate) => candidate.slug === "instagram-comment-to-dm")!;
    const copy = postArtCopy(page, "post");
    expect(headlineText(copy)).toMatch(/checklist/i);
    expect(copy.cta).toMatchObject({ verb: "Comment", word: "GUIDE", tail: "for it" });
  });

  /* The posts the catalogue shows, in catalogue order: no colour takes over, and no two in a row share one. */
  it("varies the look of posts across the whole catalogue", () => {
    const shown = seoPages.filter((page) => exampleDrawsPost(page) && exampleContext(page) !== "story" && detailLayout(page).example === "phone");
    const tones = shown.map((page) => postArtCopy(page, "post").tone);
    const counts = ["accent", "yellow", "tint"].map((tone) => tones.filter((value) => value === tone).length);
    expect(Math.max(...counts) - Math.min(...counts), tones.join(", ")).toBeLessThanOrEqual(1);
    for (let index = 1; index < tones.length; index += 1) expect(tones[index], `${shown[index].slug} after ${shown[index - 1].slug}`).not.toBe(tones[index - 1]);
    // A Reel's badge takes the top right corner a square corner post puts its shape in, so a shown Reel is centred.
    for (const page of shown.filter((candidate) => isReel(candidate) && exampleContext(candidate) === "post")) expect(postArtCopy(page, "post").layout).toBe("center");
  });

  /* Pages that share a topic share an accent, so the ones that show their post on the phone take turns
     through tone and layout: a row of them reads as different posts, not one slide template. */
  it("varies the look of posts that share an accent", () => {
    const topics = new Set(seoPages.map((page) => page.topic));
    for (const topic of topics) {
      const shown = seoPages.filter((page) => page.topic === topic && exampleDrawsPost(page) && exampleContext(page) !== "story" && detailLayout(page).example === "phone");
      const looks = shown.map((page) => { const copy = postArtCopy(page, "post"); return `${copy.tone}/${copy.layout}`; });
      if (shown.length <= 6) expect(new Set(looks).size, `${topic}: ${looks.join(", ")}`).toBe(looks.length);
    }
  });
});
