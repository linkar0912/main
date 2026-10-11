import { CampaignPerformanceSkeleton } from "@/src/components/skeleton";

// Renders under the [id] layout, so the header and tabs stay put; only the
// feed shows a placeholder.
export default function Loading() {
  return <div className="campaign-analytics-page auto-activity-tab"><CampaignPerformanceSkeleton /></div>;
}
