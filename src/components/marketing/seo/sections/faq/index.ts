import type { ComponentType } from "react";
import type { SeoPage } from "@/src/content/seo";
import type { FaqVariant } from "../../seo-layout";
import { FaqColumns } from "./columns";
import { FaqDark } from "./dark";

export const faqVariants: Record<FaqVariant, ComponentType<{ page: SeoPage }>> = {
  dark: FaqDark,
  columns: FaqColumns,
};
