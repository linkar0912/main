import type { ComponentType } from "react";
import type { SeoPage } from "@/src/content/seo";
import type { StepsVariant } from "../../seo-layout";
import { StepsCanvas } from "./canvas";
import { StepsTimeline } from "./timeline";

export { StepTimeline } from "./timeline";

export const stepsVariants: Record<StepsVariant, ComponentType<{ page: SeoPage }>> = {
  canvas: StepsCanvas,
  timeline: StepsTimeline,
};
