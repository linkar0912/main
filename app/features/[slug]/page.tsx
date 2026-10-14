import { notFound } from "next/navigation";
import { SeoLandingPage } from "@/src/components/marketing/seo/seo-page";
import { getSeoPage, getSeoPages } from "@/src/content/seo";
import { seoPageMetadata } from "@/src/lib/seo-pages";

export const dynamicParams = false;

export function generateStaticParams() {
  return getSeoPages("features").map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const page = getSeoPage("features", (await params).slug);
  if (!page) notFound();
  return seoPageMetadata(page);
}

export default async function FeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const page = getSeoPage("features", (await params).slug);
  if (!page) notFound();
  return <SeoLandingPage page={page} />;
}
