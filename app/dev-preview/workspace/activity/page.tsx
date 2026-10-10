import { notFound } from "next/navigation";
import { ActivityFeed } from "@/src/components/activity-feed";

export const metadata = { title: "Inbox · Linkar (preview)" };

export default function ActivityPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <div className="page-wrap is-wide ibx-page">
      <ActivityFeed />
    </div>
  );
}
