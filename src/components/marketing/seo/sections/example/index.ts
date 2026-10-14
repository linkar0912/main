import type { ComponentType } from "react";
import type { SeoPage } from "@/src/content/seo";
import type { ExampleVariant } from "../../seo-layout";
import { ExampleFlow } from "./flow";
import { ExamplePhone } from "./phone";
import { ExampleThread } from "./thread";

export const exampleVariants: Record<ExampleVariant, ComponentType<{ page: SeoPage }>> = {
  phone: ExamplePhone,
  flow: ExampleFlow,
  thread: ExampleThread,
};
