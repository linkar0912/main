import { getSeoPage, getSeoPages, seoRecipeMarkdown } from "@/src/content/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getSeoPages("templates").map(({ slug }) => ({ slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const page = getSeoPage("templates", (await params).slug);
  if (!page) return new Response("Recipe not found", { status: 404 });
  return new Response(seoRecipeMarkdown(page), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="linkar-${page.slug}.md"`,
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
    },
  });
}
