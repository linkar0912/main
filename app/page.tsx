import type { Metadata } from "next";
import { MarketingPage } from "@/src/components/marketing/marketing-page";

export function generateMetadata(): Metadata {
  return {
    title: "Linkar | Instagram and Facebook automation",
    description: "Build Instagram conversation flows and Facebook Page public comment replies with clear rules, useful responses, and human handoffs.",
  };
}

export default function HomePage() {
  return <MarketingPage />;
}
