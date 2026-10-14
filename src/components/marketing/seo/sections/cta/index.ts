import type { ComponentType } from "react";
import type { SeoPage } from "@/src/content/seo";
import type { CtaVariant } from "../../seo-layout";
import { CtaBanner } from "./banner";
import type { CtaTone } from "./copy";
import { CtaPhoto } from "./photo";
import { CtaPlans } from "./plans";

export type { CtaTone } from "./copy";

export const ctaVariants: Record<CtaVariant, ComponentType<{ page?: SeoPage; tone: CtaTone }>> = {
  plans: CtaPlans,
  photo: CtaPhoto,
  banner: CtaBanner,
};

export { CtaPlans };
