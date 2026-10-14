import { SeoCollectionPage } from "@/src/components/marketing/seo/seo-page";
import { seoCollectionMetadata } from "@/src/lib/seo-pages";

export const metadata = seoCollectionMetadata("solutions");

export default function SolutionsPage() {
  return <SeoCollectionPage collection="solutions" />;
}
