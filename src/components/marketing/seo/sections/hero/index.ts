import type { ComponentType } from "react";
import type { SeoPage } from "@/src/content/seo";
import type { HeroVariant } from "../../seo-layout";
import { HeroCentered } from "./centered";
import { HeroFullbleed } from "./fullbleed";
import { HeroSplit } from "./split";

export { SeoHubHero } from "./hub";

export const heroVariants: Record<HeroVariant, ComponentType<{ page: SeoPage }>> = {
  split: HeroSplit,
  fullbleed: HeroFullbleed,
  centered: HeroCentered,
};
