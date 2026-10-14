import type { ComponentType } from "react";
import type { SeoPage } from "@/src/content/seo";
import type { ExtraVariant } from "../../seo-layout";
import { ExtraChannels } from "./channels";
import { ExtraChecklist } from "./checklist";
import { ExtraCompare } from "./compare";
import { ExtraPhoto } from "./photo";

export const extraVariants: Record<ExtraVariant, ComponentType<{ page: SeoPage }>> = {
  compare: ExtraCompare,
  channels: ExtraChannels,
  photo: ExtraPhoto,
  checklist: ExtraChecklist,
};
