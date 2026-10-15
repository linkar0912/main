import type { Metadata } from "next";

import { PricingPage } from "@/src/components/marketing/pricing-page";
import { BILLING_PLANS, FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { jsonLdHtml, pricingStructuredData } from "@/src/lib/seo-pages";
import { OPEN_GRAPH_DEFAULTS } from "@/src/lib/site-url";
import { DEFAULT_SOCIAL_IMAGE } from "@/src/lib/social-image";

const HEADLINE = "Instagram automation pricing in India";
const TITLE = `${HEADLINE} · ${PRODUCT_NAME}`;
// Plan names, prices and the Free plan quota come from the billing catalog:
// "Free (1,000 messages a month), Creator ₹199, ... and Agency ₹999". Keep the
// description between 150 and 160 characters. No UPI here until the owner
// confirms recurring UPI payments.
const PLAN_PRICES = [FREE_BILLING_PLAN, ...Object.values(BILLING_PLANS)].map((plan) =>
  plan.monthlyPaise > 0
    ? `${plan.name} ₹${plan.monthlyPaise / 100}`
    : `${plan.name} (${plan.monthlyDeliveryLimit.toLocaleString("en-IN")} messages a month)`,
);
const DESCRIPTION = `Compare ${PRODUCT_NAME} plans for Instagram automation: ${PLAN_PRICES.slice(0, -1).join(", ")} and ${PLAN_PRICES.at(-1)} a month. Prices include applicable GST.`;

// The canonical and the image URL stay relative on purpose: metadataBase in
// the root layout resolves them to the absolute marketing URL. This page sets
// its own openGraph, which replaces the inherited one wholesale, so it names
// the shared social card itself.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/pricing" },
  openGraph: { ...OPEN_GRAPH_DEFAULTS, url: "/pricing", title: TITLE, description: DESCRIPTION, images: [DEFAULT_SOCIAL_IMAGE] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [DEFAULT_SOCIAL_IMAGE] },
};

export default function PublicPricingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(pricingStructuredData(HEADLINE, DESCRIPTION)) }} />
      <PricingPage />
    </>
  );
}
