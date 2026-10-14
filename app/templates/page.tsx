import { SeoCollectionPage } from "@/src/components/marketing/seo/seo-page";
import { seoCollectionMetadata } from "@/src/lib/seo-pages";

export const metadata = seoCollectionMetadata("templates");

export default function TemplatesPage() {
  return <SeoCollectionPage collection="templates" />;
}
