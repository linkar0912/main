import { SeoCollectionPage } from "@/src/components/marketing/seo/seo-page";
import { seoCollectionMetadata } from "@/src/lib/seo-pages";

export const metadata = seoCollectionMetadata("features");

export default function FeaturesPage() {
  return <SeoCollectionPage collection="features" />;
}
