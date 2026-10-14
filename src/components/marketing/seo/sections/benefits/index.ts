import type { ComponentType } from "react";
import type { SeoPage } from "@/src/content/seo";
import type { BenefitsVariant } from "../../seo-layout";
import { BenefitsCards } from "./cards";
import { BenefitsIconlist } from "./iconlist";
import { BenefitsSticky } from "./sticky";
import { BenefitsZigzag } from "./zigzag";

export const benefitsVariants: Record<BenefitsVariant, ComponentType<{ page: SeoPage }>> = {
  cards: BenefitsCards,
  sticky: BenefitsSticky,
  zigzag: BenefitsZigzag,
  iconlist: BenefitsIconlist,
};
