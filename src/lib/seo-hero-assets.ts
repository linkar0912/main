import scenes from "@/src/content/seo/hero-scenes.json";
import type { SeoCollection } from "@/src/content/seo";

export type SeoHeroPage = { collection: SeoCollection; slug?: string };

const heroScenes = new Map(scenes.map((scene) => [scene.key, scene]));

/** A distinct image is required for each detail page and each collection hub. */
export function seoHeroAsset(page: SeoHeroPage) {
  const key = page.slug ? `${page.collection}/${page.slug}` : page.collection;
  const scene = heroScenes.get(key);
  if (!scene) throw new Error(`Missing editorial hero scene: ${key}`);
  return {
    src: `/marketing/seo/${key.includes("/") ? key : `${key}/index`}.webp`,
    alt: scene.alt,
    width: 1536,
    height: 1024,
  } as const;
}
