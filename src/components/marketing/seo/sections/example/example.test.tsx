import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { seoPages, type SeoPage } from "@/src/content/seo";
import { seoImageSlot } from "@/src/content/seo/image-slots";
import { exampleDrawsPost, nextFor } from "../../seo-example";
import { exampleVariants } from "./index";

vi.mock("next/image", async () => {
  const { createElement } = await import("react");
  return { default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) };
});

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

    // Only the phone draws a photo, only this page's example-post slot, and only when there is a post behind the message.
    const slots = [...html.matchAll(/data-image-slot="([^"]+)"/g)].map((match) => match[1]);
    const images = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]);
    const post = seoImageSlot({ collection: page.collection, slug: page.slug }, "example-post");
    if (variant === "phone") {
      expect([...slots, ...images].every((value) => value === post.id || value === post.src)).toBe(true);
      expect(slots.length + images.length).toBe(exampleDrawsPost(page) ? 1 : 0);
    } else {
      expect(slots).toHaveLength(0);
      expect(images).toHaveLength(0);
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
