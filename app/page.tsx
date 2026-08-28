import type { Metadata } from "next";
import { MarketingPage } from "@/src/components/marketing/marketing-page";

export function generateMetadata(): Metadata {
  return {
    title: "Linkar — conversations that keep moving",
    description: "Build clear conversation flows with useful replies, timely follow-ups, and human handoffs.",
  };
}

export default function HomePage() {
  return <MarketingPage />;
}
