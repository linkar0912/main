import type { Metadata } from "next";
import { faqItems } from "@/src/components/marketing/marketing-content";
import { MarketingPage } from "@/src/components/marketing/marketing-page";
import { BILLING_PLANS, FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { LEGAL_ENTITY } from "@/src/lib/legal-entity";
import { OPEN_GRAPH_DEFAULTS, publicSiteOrigin } from "@/src/lib/site-url";

// Lead with what people search for; the brand goes last.
const TITLE = `Instagram DM automation & comment auto-reply · ${PRODUCT_NAME}`;
const DESCRIPTION = `Auto-reply to Instagram comments, DMs and Story mentions, and to Facebook Page comments. Send links and hand off to your team. Free to start, from ₹${BILLING_PLANS.creator.monthlyPaise / 100} a month.`;

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/" },
    openGraph: { ...OPEN_GRAPH_DEFAULTS, url: "/", title: TITLE, description: DESCRIPTION },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  };
}

/** Organization, WebSite, SoftwareApplication and FAQPage structured data, priced from the billing catalog. */
function structuredData() {
  const origin = publicSiteOrigin();
  const plans = [FREE_BILLING_PLAN, ...Object.values(BILLING_PLANS)];
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${origin}/#organization`,
      name: LEGAL_ENTITY.tradeName,
      url: origin,
      logo: `${origin}/icon.png`,
      email: LEGAL_ENTITY.supportEmail,
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: LEGAL_ENTITY.supportEmail,
        areaServed: "IN",
        availableLanguage: "English",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${origin}/#website`,
      name: PRODUCT_NAME,
      url: origin,
      inLanguage: "en-IN",
      publisher: { "@id": `${origin}/#organization` },
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: PRODUCT_NAME,
      url: origin,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: DESCRIPTION,
      publisher: { "@id": `${origin}/#organization` },
      offers: plans.map((plan) => ({
        "@type": "Offer",
        name: `${plan.name} plan`,
        price: (plan.monthlyPaise / 100).toFixed(2),
        priceCurrency: "INR",
        url: `${origin}/pricing`,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ];
}

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify does not escape "<", so a value containing
        // "</script>" could close the tag early; escape it.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, "\\u003c") }}
      />
      <MarketingPage />
    </>
  );
}
