import { ActivityFeed } from "@/src/components/activity-feed";

export const metadata = { title: "Inbox · Linkar" };

export default function ActivityPage() {
  return (
    <div className="page-wrap is-wide ibx-page">
      <ActivityFeed />
    </div>
  );
}
