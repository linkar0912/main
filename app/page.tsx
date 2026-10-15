import type { Metadata } from "next";
import { MarketingPage } from "@/src/components/marketing/marketing-page";
import { BILLING_PLANS, FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { homeStructuredData, jsonLdHtml } from "@/src/lib/seo-pages";
import { OPEN_GRAPH_DEFAULTS } from "@/src/lib/site-url";

// Lead with what people search for; the brand goes last. The homepage owns
// "Instagram automation"; keep the title near 57 characters and the
// description between 150 and 160 so neither is cut short in results. It
// names both channels (public-page.test.tsx checks this), and the Free plan
// quota and the lowest paid price come from the billing catalog. No UPI here
// until the owner confirms recurring UPI payments.
const HEADLINE = "Instagram Automation for Comments, DMs & Stories";
const TITLE = `${HEADLINE} · ${PRODUCT_NAME}`;
const FREE_MONTHLY_MESSAGES = FREE_BILLING_PLAN.monthlyDeliveryLimit.toLocaleString("en-IN");
const LOWEST_PAID_PRICE = Math.min(...Object.values(BILLING_PLANS).map((plan) => plan.monthlyPaise)) / 100;
const DESCRIPTION = `Instagram automation for Indian creators and brands: auto-reply to comments, DMs, Stories and Facebook Pages. Free plan: ${FREE_MONTHLY_MESSAGES} messages a month, paid from ₹${LOWEST_PAID_PRICE}.`;

// No openGraph images here: app/opengraph-image.tsx sits in this segment, so
// Next attaches it to this page, and file-based images win over config.
export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/" },
    openGraph: { ...OPEN_GRAPH_DEFAULTS, url: "/", title: TITLE, description: DESCRIPTION },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  };
}

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(homeStructuredData(HEADLINE, DESCRIPTION)) }} />
      <MarketingPage />
    </>
  );
}
