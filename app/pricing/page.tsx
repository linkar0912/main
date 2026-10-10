import type { Metadata } from "next";

import { PricingPage } from "@/src/components/marketing/pricing-page";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { OPEN_GRAPH_DEFAULTS } from "@/src/lib/site-url";

const TITLE = `Pricing · ${PRODUCT_NAME}`;
const DESCRIPTION = `Start free with ${PRODUCT_NAME}, then grow with simple creator, growth, and agency plans. Every displayed price includes applicable GST.`;

// The canonical stays relative on purpose: metadataBase in the root layout
// resolves it to the absolute marketing URL.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/pricing" },
  openGraph: { ...OPEN_GRAPH_DEFAULTS, url: "/pricing", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function PublicPricingPage() {
  return <PricingPage />;
}
