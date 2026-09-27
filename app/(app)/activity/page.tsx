import { ActivityFeed } from "@/src/components/activity-feed";
import { PageHeader } from "@/src/components/page-header";

export const metadata = { title: "Inbox · Linkar" };

export default function ActivityPage() {
  return (
    <div className="page-wrap is-wide inbox-page-wrap">
      <PageHeader
        title="Inbox"
        description="Read messages, follow up with people, and keep Page comments in view."
      />
      <ActivityFeed />
    </div>
  );
}
