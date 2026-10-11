import { InlineContentSkeleton } from "@/src/components/skeleton";

// Renders under the [id] layout, so the header and tabs stay put while a tab
// loads; only the content area shows a placeholder.
export default function Loading() {
  return <InlineContentSkeleton label="Loading automation" rows={4} />;
}
