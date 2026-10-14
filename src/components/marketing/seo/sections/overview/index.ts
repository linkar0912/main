import type { ComponentType } from "react";
import type { SeoPage } from "@/src/content/seo";
import type { OverviewVariant } from "../../seo-layout";
import { OverviewPile } from "./pile";
import { OverviewStatement } from "./statement";
import { OverviewZigzag } from "./zigzag";

export const overviewVariants: Record<OverviewVariant, ComponentType<{ page: SeoPage }>> = {
  pile: OverviewPile,
  zigzag: OverviewZigzag,
  statement: OverviewStatement,
};
