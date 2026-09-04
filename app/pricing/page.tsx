import type { Metadata } from "next";

import { PricingPage } from "@/src/components/marketing/pricing-page";

export const metadata: Metadata = {
  title: "Pricing | Linkar",
  description: "Start free with Linkar, then grow with simple creator, growth, and agency plans. Every displayed price includes applicable GST.",
  alternates: { canonical: "/pricing" },
};

export default function PublicPricingPage() {
  return <PricingPage />;
}
