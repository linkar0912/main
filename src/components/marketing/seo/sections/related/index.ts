import type { ComponentType } from "react";
import type { SeoPage } from "@/src/content/seo";
import type { RelatedVariant } from "../../seo-layout";
import { RelatedCards } from "./cards";
import { RelatedRows } from "./rows";

export { SeoHubGroups } from "./hub-groups";
export { SeoPageCard, SeoPageCardList } from "./page-card";

export const relatedVariants: Record<RelatedVariant, ComponentType<{ page: SeoPage }>> = {
  cards: RelatedCards,
  rows: RelatedRows,
};
